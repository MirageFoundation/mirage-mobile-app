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
  type MirageWallet,
  signCanonical,
  b64encode,
  hexToBytes,
  computePoW,
  estimatePoWTime,
} from "@/src/wallet";

import { getParameters } from "@/src/api/read/endpoints/parameters";
import { getUserStatus } from "@/src/api/read/endpoints/users";

import { canonSignedWithPow } from "./canonical";
import type {
  SignedPayload,
  EnvelopeParams,
  PoWProgressCallback,
  WriteApiError,
  WriteErrorCode,
} from "./types";
import { WriteApiError as WriteApiErrorClass, WriteErrorCode as WriteErrorCodeEnum } from "./types";

// ============================================
// Types
// ============================================

export interface BuildEnvelopeOptions<TPayload extends Record<string, unknown>> {
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
export async function buildSignedEnvelope<TPayload extends Record<string, unknown>>(
  options: BuildEnvelopeOptions<TPayload>
): Promise<SignedPayload<TPayload>> {
  const { wallet, baseBuilder, payloadFields, skipPoW = false, onPoWProgress } = options;

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
  const timestampMs = Date.now();
  const lastBlockHashBytes = hexToBytes(params.last_block_hash);

  const envelopeParams: EnvelopeParams = {
    pubkey33: wallet.publicKey,
    lastBlockHashBytes,
    difficulty,
    timestampMs,
  };

  const base = baseBuilder({ ...envelopeParams, ...payloadFields });

  // 4. Compute PoW if needed
  let pow = 0;
  if (difficulty > 0) {
    const estimatedTime = estimatePoWTime(difficulty) * 1000; // Convert to ms

    const progressCallback = onPoWProgress
      ? (attempts: number, elapsedMs: number) => {
          onPoWProgress({
            attempts,
            elapsedMs,
            estimatedTotalMs: estimatedTime,
          });
        }
      : undefined;

    const powResult = await computePoW(
      {
        base,
        lastBlockHash: params.last_block_hash,
        requiredBits: difficulty,
      },
      progressCallback
    );

    pow = powResult.pow;
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
export async function buildEnvelopeWithParams<TPayload extends Record<string, unknown>>(
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
  const timestampMs = Date.now();
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

    const powResult = await computePoW(
      {
        base,
        lastBlockHash,
        requiredBits: difficulty,
      },
      progressCallback
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
