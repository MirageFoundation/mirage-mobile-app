/**
 * Envelope Builder for Mirage Write API
 *
 * Builds signed envelopes for API requests by:
 * 1. Getting fresh parameters from Read API
 * 2. Determining if PoW is needed (free tier only)
 * 3. Building canonical bytes
 * 4. Computing PoW if needed
 * 5. Signing the final bytes
 * 6. Creating the JSON payload
 */

// @ts-expect-error - bundler resolves this correctly at runtime
import { sha256 } from "@noble/hashes/sha2";

import {
  b64encode,
  computePoW,
  estimatePoWTime,
  hexToBytes,
  type MirageWallet,
  signCanonical,
} from "@/src/wallet";

import { getParameters } from "@/src/api/read/endpoints/parameters";
import { getUserStatus } from "@/src/api/read/endpoints/users";

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
  /** Wallet for signing */
  wallet: MirageWallet;
  /** Function to build canonical base bytes */
  baseBuilder: (params: EnvelopeParams & TPayload) => Uint8Array;
  /** Message-specific payload fields */
  payloadFields: TPayload;
  /** Whether to skip PoW (for paid tier operations) */
  skipPoW?: boolean;
  /** Callback for PoW progress updates */
  onPoWProgress?: PoWProgressCallback;
}

// ============================================
// Envelope Builder
// ============================================

/**
 * Build a signed envelope for a write API request
 *
 * This is the main function used by all mutation hooks to create
 * signed payloads for the backend.
 */
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

  // 1. Get fresh parameters from Read API
  const params = await getParameters({ address: wallet.address });

  // 2. Determine if PoW is needed
  let userLevel = 0;
  let difficulty = params.pow_difficulty;

  if (!skipPoW) {
    try {
      const userStatus = await getUserStatus({ address: wallet.address });
      userLevel = userStatus.user_level;
    } catch {
      // If user status fetch fails, assume free tier
      userLevel = 0;
    }

    // Paid users (level > 0) don't need PoW
    if (userLevel > 0) {
      difficulty = 0;
    }
  } else {
    // Operations like upgrade don't need PoW
    difficulty = 0;
  }

  // 3. Build canonical base bytes
  // Use slightly past timestamp to avoid clock-skew rejection like web client (-15s)
  let timestampMs = Math.max(0, Date.now() - 15000);
  const lastBlockHashBytes = hexToBytes(params.last_block_hash);

  const envelopeParams: EnvelopeParams = {
    pubkey33: wallet.publicKey,
    lastBlockHashBytes,
    difficulty,
    timestampMs,
  };

  let base = baseBuilder({ ...envelopeParams, ...payloadFields });

  // 4. Compute PoW if needed
  let pow = 0;
  if (difficulty > 0) {
    const estimatedTime = estimatePoWTime(difficulty) * 1000; // Convert to ms

    console.log(
      `[PoW] Starting computation with difficulty=${difficulty} bits`
    );
    console.log(
      `[PoW] Estimated time: ${Math.round(
        estimatedTime / 1000
      )}s (~${Math.round(estimatedTime / 60000)}min)`
    );
    console.log(
      `[PoW] Expected attempts: ~${Math.pow(2, difficulty).toLocaleString()}`
    );

    const progressCallback = onPoWProgress
      ? (attempts: number, elapsedMs: number) => {
          // Log every 100 attempts
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

    // Calculate a reasonable cap for attempts (multiple of expected attempts)
    const attemptFactorEnv =
      (typeof process !== "undefined" && (process as any).env?.EXPO_PUBLIC_POW_ATTEMPT_FACTOR) ||
      (typeof process !== "undefined" && (process as any).env?.POW_ATTEMPT_FACTOR);
    const attemptFactor = attemptFactorEnv ? Math.max(1, Number(attemptFactorEnv)) : 8; // default 8x
    const maxAttempts = Math.max(1000, Math.floor(Math.pow(2, difficulty) * attemptFactor));

    try {
      const powResult = await computePoW(
        {
          base,
          lastBlockHash: params.last_block_hash,
          requiredBits: difficulty,
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
        console.log("[PoW] Attempt cap reached; refreshing parameters and retrying once...");

        // Refresh parameters to get a new salt and try again once
        const refreshed = await getParameters({ address: wallet.address });
        timestampMs = Date.now();
        const lastBlockHashBytes2 = hexToBytes(refreshed.last_block_hash);
        const envelopeParams2: EnvelopeParams = {
          pubkey33: wallet.publicKey,
          lastBlockHashBytes: lastBlockHashBytes2,
          difficulty,
          timestampMs,
        };
        const base2 = baseBuilder({ ...envelopeParams2, ...payloadFields });

        const powResult2 = await computePoW(
          {
            base: base2,
            lastBlockHash: refreshed.last_block_hash,
            requiredBits: difficulty,
          },
          progressCallback,
          maxAttempts
        );

        // Use refreshed values from now on
        pow = powResult2.pow;
        base = base2;
        (params as any).last_block_hash = refreshed.last_block_hash;
        console.log(
          `[PoW] Complete (retry)! Found nonce=${pow} after ${powResult2.attempts} attempts in ${powResult2.computeTimeMs}ms`
        );
      } else {
        // Timed out or other error; rethrow so UI can show a clear error
        throw err;
      }
    }
  } else {
    console.log(`[PoW] Skipping PoW (difficulty=0, userLevel=${userLevel})`);
  }

  // 5. Build signed bytes (insert tag 5 for PoW)
  const signedBytes = canonSignedWithPow(base, pow);

  // 6. Hash the signed bytes
  const messageHash = sha256(signedBytes);

  // 7. Sign the hash
  const signature = signCanonical(wallet.privateKey, messageHash);

  // 8. Build and return the envelope
  return {
    pubkey: b64encode(wallet.publicKey),
    signature: b64encode(signature),
    timestamp: timestampMs,
    last_block_hash: params.last_block_hash,
    pow_difficulty: difficulty,
    pow,
    ...payloadFields,
  } as SignedPayload<TPayload>;
}

/**
 * Build envelope with explicit parameters (for when you already have fresh params)
 *
 * Use this when you want to control the parameters fetching yourself,
 * or when building multiple envelopes with the same parameters.
 */
export async function buildEnvelopeWithParams<
  TPayload extends Record<string, unknown>
>(
  options: BuildEnvelopeOptions<TPayload> & {
    lastBlockHash: string;
    powDifficulty: number;
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
    userLevel,
  } = options;

  // Determine actual difficulty
  let difficulty = powDifficulty;
  if (skipPoW || userLevel > 0) {
    difficulty = 0;
  }

  // Build canonical base bytes
  // Use slightly past timestamp to avoid clock-skew rejection like web client (-15s)
  const timestampMs = Math.max(0, Date.now() - 15000);
  const lastBlockHashBytes = hexToBytes(lastBlockHash);

  const envelopeParams: EnvelopeParams = {
    pubkey33: wallet.publicKey,
    lastBlockHashBytes,
    difficulty,
    timestampMs,
  };

  const base = baseBuilder({ ...envelopeParams, ...payloadFields });

  // Compute PoW if needed
  let pow = 0;
  if (difficulty > 0) {
    const estimatedTime = estimatePoWTime(difficulty) * 1000;

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
      (typeof process !== "undefined" && (process as any).env?.EXPO_PUBLIC_POW_ATTEMPT_FACTOR) ||
      (typeof process !== "undefined" && (process as any).env?.POW_ATTEMPT_FACTOR);
    const attemptFactor = attemptFactorEnv ? Math.max(1, Number(attemptFactorEnv)) : 8;
    const maxAttempts = Math.max(1000, Math.floor(Math.pow(2, difficulty) * attemptFactor));

    const powResult = await computePoW(
      {
        base,
        lastBlockHash,
        requiredBits: difficulty,
      },
      progressCallback,
      maxAttempts
    );

    pow = powResult.pow;
  }

  // Build signed bytes
  const signedBytes = canonSignedWithPow(base, pow);

  // Hash and sign
  const messageHash = sha256(signedBytes);
  const signature = signCanonical(wallet.privateKey, messageHash);

  return {
    pubkey: b64encode(wallet.publicKey),
    signature: b64encode(signature),
    timestamp: timestampMs,
    last_block_hash: lastBlockHash,
    pow_difficulty: difficulty,
    pow,
    ...payloadFields,
  } as SignedPayload<TPayload>;
}
