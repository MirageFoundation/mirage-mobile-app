import {
  b64encode,
  computePoW,
  estimatePoWTime,
  hexToBytes,
  isPowCancelled,
  type MirageWallet,
  signCanonical,
} from "@/src/wallet";

import * as Sentry from "@sentry/react-native";
import { getParameters } from "@/src/api/read/endpoints/parameters";
import { useAuthStore } from "@/src/stores";

import { canonSignedWithPow } from "./canonical";
import type {
  EnvelopeParams,
  PoWProgressCallback,
  SignedPayload,
} from "./types";

// ============================================
// Types
// ============================================

export interface BuildEnvelopeOptions<
  TPayload extends Record<string, unknown>
> {
  wallet: MirageWallet;
  baseBuilder: (params: EnvelopeParams & TPayload) => Uint8Array;
  payloadFields: TPayload;
  skipPoW?: boolean;
  onPoWProgress?: PoWProgressCallback;
}

// ============================================
// Envelope Builder
// ============================================

function randomUint32(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? 0;
  }

  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function generateEnvelopeNonce(): bigint {
  const timestampNs = BigInt(Date.now()) * 1000000n;
  const nonce = timestampNs + BigInt(randomUint32());

  if (nonce > 0n) {
    return nonce;
  }

  return BigInt(Date.now()) * 1000n + BigInt((Math.floor(Math.random() * 999) + 1) >>> 0);
}

export async function buildSignedEnvelope<
  TPayload extends Record<string, unknown>
>(options: BuildEnvelopeOptions<TPayload>): Promise<SignedPayload<TPayload>> {
  const {
    wallet,
    baseBuilder,
    payloadFields,
    skipPoW = false,
    onPoWProgress,
  } = options;

  const cachedUserLevel = useAuthStore.getState().userLevel;
  let params: Awaited<ReturnType<typeof getParameters>> | null = null;

  if (!skipPoW && cachedUserLevel === 0) {
    params = await getParameters({ address: wallet.address });

    console.log(`[Envelope] Using last_block_hash: ${params.last_block_hash.substring(0, 16)}...`);
  }

  const userLevel = params?.user_level ?? cachedUserLevel;
  const needsPoW = !skipPoW && userLevel === 0;
  const difficulty = needsPoW ? params?.pow_difficulty ?? 0 : 0;

  const envelopeNonce = generateEnvelopeNonce();
  let timestampMs = Math.max(0, Date.now() - 15000);
  let effectiveBlockHash = needsPoW ? params?.last_block_hash ?? "" : "";
  const lastBlockHashBytes = hexToBytes(effectiveBlockHash);

  const envelopeParams: EnvelopeParams = {
    pubkey33: wallet.publicKey,
    lastBlockHashBytes,
    difficulty,
    timestampMs,
    envelopeNonce,
  };

  let base = baseBuilder({ ...envelopeParams, ...payloadFields });

  let pow = 0;
  if (needsPoW) {
    if (!params) {
      throw new Error("PoW parameters missing");
    }

    const estimatedTime = estimatePoWTime(difficulty, params.pow_base_bits, params.pow_factor) * 1000;

    console.log(
      `[PoW] Starting computation with difficulty=${difficulty}, baseBits=${params.pow_base_bits}, factor=${params.pow_factor}`
    );
    console.log(
      `[PoW] Estimated time: ${Math.round(
        estimatedTime / 1000
      )}s (~${Math.round(estimatedTime / 60000)}min)`
    );

    const progressCallback = onPoWProgress
      ? (attempts: number, elapsedMs: number) => {
          if (attempts % 100 === 0) {
            const rate = attempts / (elapsedMs / 1000);
            console.log(
              `[PoW] Progress: ${attempts} attempts, ${Math.round(
                elapsedMs / 1000
              )}s elapsed, ${rate.toFixed(1)} hashes/sec`
            );
          }
          onPoWProgress({
            attempts,
            elapsedMs,
            estimatedTotalMs: estimatedTime,
          });
        }
      : undefined;

    const attemptFactorEnv =
      (typeof process !== "undefined" &&
        (process as any).env?.EXPO_PUBLIC_POW_ATTEMPT_FACTOR) ||
      (typeof process !== "undefined" &&
        (process as any).env?.POW_ATTEMPT_FACTOR);
    const attemptFactor = attemptFactorEnv
      ? Math.max(1, Number(attemptFactorEnv))
      : 8;
    const expectedAttempts = Number(
      BigInt(Math.round(1000 * Math.pow(1 + params.pow_factor, difficulty))) *
      BigInt(Math.pow(2, params.pow_base_bits)) / 1000n
    );
    const maxAttempts = Math.max(
      1000,
      Math.floor(expectedAttempts * attemptFactor)
    );

    try {
      const powResult = await computePoW(
        {
          base,
          lastBlockHash: params.last_block_hash,
          powDifficulty: difficulty,
          powBaseBits: params.pow_base_bits,
          powFactor: params.pow_factor,
        },
        progressCallback,
        maxAttempts
      );

      pow = powResult.pow;
      console.log(
        `[PoW] Complete! Found nonce=${pow} after ${powResult.attempts} attempts in ${powResult.computeTimeMs}ms`
      );
    } catch (err) {
      const msg = String((err as Error)?.message || err || "");
      if (/exceeded \d+ attempts/i.test(msg)) {
        Sentry.addBreadcrumb({
          category: "pow",
          message: "PoW attempt cap reached, retrying with fresh params",
          level: "warning",
          data: { difficulty, maxAttempts },
        });
        console.log(
          "[PoW] Attempt cap reached; refreshing parameters and retrying once..."
        );

        const refreshed = await getParameters({ address: wallet.address });
        timestampMs = Date.now();
        const lastBlockHashBytes2 = hexToBytes(refreshed.last_block_hash);
        const envelopeParams2: EnvelopeParams = {
          pubkey33: wallet.publicKey,
          lastBlockHashBytes: lastBlockHashBytes2,
          difficulty,
          timestampMs,
          envelopeNonce,
        };
        const base2 = baseBuilder({ ...envelopeParams2, ...payloadFields });

        const powResult2 = await computePoW(
          {
            base: base2,
            lastBlockHash: refreshed.last_block_hash,
            powDifficulty: difficulty,
            powBaseBits: refreshed.pow_base_bits,
            powFactor: refreshed.pow_factor,
          },
          progressCallback,
          maxAttempts
        );

        pow = powResult2.pow;
        base = base2;
        effectiveBlockHash = refreshed.last_block_hash;
        (params as any).last_block_hash = refreshed.last_block_hash;
        console.log(
          `[PoW] Complete (retry)! Found nonce=${pow} after ${powResult2.attempts} attempts in ${powResult2.computeTimeMs}ms`
        );
      } else {
        if (isPowCancelled(err)) {
          throw err;
        }
        Sentry.captureException(err, {
          tags: { action: "pow_computation" },
          extra: { difficulty, powBaseBits: params.pow_base_bits, powFactor: params.pow_factor },
        });
        throw err;
      }
    }
  } else {
    console.log(`[PoW] Skipping PoW (skipPoW=${skipPoW}, userLevel=${userLevel})`);
  }

  console.log("[Envelope] Building signed bytes...");
  const signedBytes = canonSignedWithPow(base, pow);

  console.log("[Envelope] Signing canonical bytes...");
  const signature = signCanonical(wallet.privateKey, signedBytes);

  const envelope = {
    pubkey: b64encode(wallet.publicKey),
    signature: b64encode(signature),
    timestamp: timestampMs,
    last_block_hash: effectiveBlockHash,
    pow_difficulty: difficulty,
    pow,
    envelope_nonce: envelopeNonce.toString(),
    ...payloadFields,
  } as SignedPayload<TPayload>;

  console.log("[Envelope] Envelope built successfully, ready to send to API");
  return envelope;
}

export async function buildEnvelopeWithParams<
  TPayload extends Record<string, unknown>
>(
  options: BuildEnvelopeOptions<TPayload> & {
    lastBlockHash: string;
    powDifficulty: number;
    powBaseBits: number;
    powFactor: number;
    userLevel: number;
  }
): Promise<SignedPayload<TPayload>> {
  const {
    wallet,
    baseBuilder,
    payloadFields,
    skipPoW = false,
    onPoWProgress,
    lastBlockHash,
    powDifficulty,
    powBaseBits,
    powFactor,
    userLevel,
  } = options;

  const needsPoW = !skipPoW && userLevel === 0;
  let difficulty = powDifficulty;
  if (!needsPoW) {
    difficulty = 0;
  }

  const envelopeNonce = generateEnvelopeNonce();
  const timestampMs = Math.max(0, Date.now() - 15000);
  const effectiveBlockHash = needsPoW ? lastBlockHash : "";
  const lastBlockHashBytes = hexToBytes(effectiveBlockHash);

  const envelopeParams: EnvelopeParams = {
    pubkey33: wallet.publicKey,
    lastBlockHashBytes,
    difficulty,
    timestampMs,
    envelopeNonce,
  };

  const base = baseBuilder({ ...envelopeParams, ...payloadFields });

  let pow = 0;
  if (needsPoW) {
    const estimatedTime = estimatePoWTime(difficulty, powBaseBits, powFactor) * 1000;

    const progressCallback = onPoWProgress
      ? (attempts: number, elapsedMs: number) => {
          onPoWProgress({
            attempts,
            elapsedMs,
            estimatedTotalMs: estimatedTime,
          });
        }
      : undefined;

    const attemptFactorEnv =
      (typeof process !== "undefined" &&
        (process as any).env?.EXPO_PUBLIC_POW_ATTEMPT_FACTOR) ||
      (typeof process !== "undefined" &&
        (process as any).env?.POW_ATTEMPT_FACTOR);
    const attemptFactor = attemptFactorEnv
      ? Math.max(1, Number(attemptFactorEnv))
      : 8;
    const expectedAttempts = Number(
      BigInt(Math.round(1000 * Math.pow(1 + powFactor, difficulty))) *
      BigInt(Math.pow(2, powBaseBits)) / 1000n
    );
    const maxAttempts = Math.max(
      1000,
      Math.floor(expectedAttempts * attemptFactor)
    );

    const powResult = await computePoW(
      {
        base,
        lastBlockHash,
        powDifficulty: difficulty,
        powBaseBits,
        powFactor,
      },
      progressCallback,
      maxAttempts
    );

    pow = powResult.pow;
  }

  const signedBytes = canonSignedWithPow(base, pow);
  const signature = signCanonical(wallet.privateKey, signedBytes);

  return {
    pubkey: b64encode(wallet.publicKey),
    signature: b64encode(signature),
    timestamp: timestampMs,
    last_block_hash: effectiveBlockHash,
    pow_difficulty: difficulty,
    pow,
    envelope_nonce: envelopeNonce.toString(),
    ...payloadFields,
  } as SignedPayload<TPayload>;
}
