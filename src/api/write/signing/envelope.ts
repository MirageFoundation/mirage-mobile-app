import {
  b64encode,
  computePoW,
  estimatePoWTime,
  hexToBytes,
  isPowCancelled,
  isPowTimedOut,
  type MirageWallet,
  signCanonical,
} from "@/src/wallet";

import * as Sentry from "@sentry/react-native";
import { getCachedRelayDecision } from "@/src/api/cache/account-status-cache";
import { getParameters } from "@/src/api/read/endpoints/parameters";
import { queryClient } from "@/src/providers/query-client";
import { useAuthStore } from "@/src/stores";
import { QuotaExhaustedError } from "@/src/domain/subscriptions";

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
  requireBlockHash?: boolean;
  forcePoW?: boolean;
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

// Refresh before the chain's recent-block-hash window can expire. Multiple
// fresh challenges still give slower devices enough aggregate compute time.
const POW_CHALLENGE_COMPUTE_TIME_MS = 20_000;
const MAX_POW_CHALLENGES = 15;

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
    requireBlockHash = false,
    forcePoW = false,
    onPoWProgress,
  } = options;

  const authState = useAuthStore.getState();
  const relayDecision = getCachedRelayDecision(queryClient, wallet.address, {
    userLevel: authState.userLevel,
    effectivePaid: null,
  });
  if (!skipPoW && relayDecision.quota_exhausted) {
    throw new QuotaExhaustedError();
  }
  // forcePoW is for unpaid retries only; entitled paid/Admin never fall back to PoW.
  const userCanSkipPoW = relayDecision.relay_allowed;
  const needsPoW = !skipPoW && !userCanSkipPoW && (forcePoW || relayDecision.pow_required);
  let params: Awaited<ReturnType<typeof getParameters>> | null = null;

  if (needsPoW || requireBlockHash) {
    params = await getParameters({ address: wallet.address });
    console.log(`[Envelope] Using last_block_hash: ${params.last_block_hash.substring(0, 16)}...`);
  }

  let difficulty = needsPoW ? params?.pow_difficulty ?? 0 : 0;

  const envelopeNonce = generateEnvelopeNonce();
  // v1.32.3: the chain accepts envelope timestamps at most 60s old and 30s in
  // the future. Never backdate; stamp as late as possible. For PoW users the
  // timestamp is part of the PoW preimage, so it is re-stamped at the start of
  // each PoW challenge (each challenge is capped at ~20s of compute).
  let timestampMs = Date.now();
  let effectiveBlockHash = needsPoW || requireBlockHash ? params?.last_block_hash ?? "" : "";
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

    const attemptFactorEnv =
      (typeof process !== "undefined" &&
        (process as any).env?.EXPO_PUBLIC_POW_ATTEMPT_FACTOR) ||
      (typeof process !== "undefined" &&
        (process as any).env?.POW_ATTEMPT_FACTOR);
    const attemptFactor = attemptFactorEnv
      ? Math.max(1, Number(attemptFactorEnv))
      : 8;
    let currentParams = params;
    let completedAttempts = 0;
    let completedElapsedMs = 0;

    for (let challenge = 0; challenge < MAX_POW_CHALLENGES; challenge++) {
      difficulty = currentParams.pow_difficulty;
      // Fresh timestamp per challenge so the envelope stays inside the 60s
      // window even when earlier challenges consumed compute time.
      timestampMs = Date.now();
      effectiveBlockHash = currentParams.last_block_hash;
      base = baseBuilder({
        pubkey33: wallet.publicKey,
        lastBlockHashBytes: hexToBytes(effectiveBlockHash),
        difficulty,
        timestampMs,
        envelopeNonce,
        ...payloadFields,
      });

      const estimatedTime =
        estimatePoWTime(
          difficulty,
          currentParams.pow_base_bits,
          currentParams.pow_factor,
        ) * 1000;
      const expectedAttempts = Number(
        BigInt(
          Math.round(
            1000 * Math.pow(1 + currentParams.pow_factor, difficulty),
          ),
        ) * BigInt(Math.pow(2, currentParams.pow_base_bits)) / 1000n,
      );
      const maxAttempts = Math.max(
        1000,
        Math.floor(expectedAttempts * attemptFactor),
      );
      let challengeAttempts = 0;
      let challengeElapsedMs = 0;
      const progressCallback = onPoWProgress
        ? (attempts: number, elapsedMs: number) => {
            challengeAttempts = attempts;
            challengeElapsedMs = elapsedMs;
            const totalAttempts = completedAttempts + attempts;
            const totalElapsedMs = completedElapsedMs + elapsedMs;
            const observedRate =
              totalElapsedMs > 0
                ? totalAttempts / (totalElapsedMs / 1000)
                : 0;
            onPoWProgress({
              attempts: totalAttempts,
              elapsedMs: totalElapsedMs,
              estimatedTotalMs:
                observedRate > 0
                  ? (expectedAttempts / observedRate) * 1000
                  : estimatedTime,
              expectedAttempts,
            });
          }
        : undefined;

      console.log(
        `[PoW] Challenge ${challenge + 1}/${MAX_POW_CHALLENGES}: difficulty=${difficulty}, baseBits=${currentParams.pow_base_bits}, factor=${currentParams.pow_factor}`,
      );

      try {
        const powResult = await computePoW(
          {
            base,
            lastBlockHash: currentParams.last_block_hash,
            powDifficulty: difficulty,
            powBaseBits: currentParams.pow_base_bits,
            powFactor: currentParams.pow_factor,
          },
          progressCallback,
          maxAttempts,
          POW_CHALLENGE_COMPUTE_TIME_MS,
          false,
        );

        pow = powResult.pow;
        console.log(
          `[PoW] Complete! Found nonce=${pow} after ${completedAttempts + powResult.attempts} attempts`,
        );
        break;
      } catch (err) {
        if (isPowCancelled(err)) {
          throw err;
        }

        const msg = String((err as Error)?.message || err || "");
        const shouldRefreshChallenge =
          isPowTimedOut(err) ||
          /max attempts|attempt cap|exceeded .*attempts/i.test(msg);

        if (shouldRefreshChallenge && challenge < MAX_POW_CHALLENGES - 1) {
          completedAttempts += challengeAttempts;
          completedElapsedMs += challengeElapsedMs;
          Sentry.addBreadcrumb({
            category: "pow",
            message: "Refreshing PoW challenge before it becomes stale",
            level: "info",
            data: {
              challenge: challenge + 1,
              elapsedMs: challengeElapsedMs,
              attempts: challengeAttempts,
            },
          });
          currentParams = await getParameters({ address: wallet.address });
          continue;
        }

        Sentry.captureException(err, {
          tags: { action: "pow_computation" },
          extra: {
            challenge: challenge + 1,
            difficulty,
            powBaseBits: currentParams.pow_base_bits,
            powFactor: currentParams.pow_factor,
          },
        });
        throw err;
      }
    }
  } else {
    console.log(`[PoW] Skipping PoW (skipPoW=${skipPoW}, relay_allowed=${userCanSkipPoW})`);
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

