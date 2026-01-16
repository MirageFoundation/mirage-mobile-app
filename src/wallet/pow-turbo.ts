/**
 * Proof of Work computation using react-native-argon2-turbo (TurboModule)
 *
 * This version uses the native PoW loop for maximum performance (500+ h/s vs ~80 h/s)
 */

import {
  computePow as computePowNative,
  cancelPow,
  getPowProgress,
} from "react-native-argon2-turbo";

import { bytesToHex } from "./crypto";

// ============================================
// Types
// ============================================

export interface PoWInput {
  base: Uint8Array;
  lastBlockHash: string;
  requiredBits: number;
}

export interface PoWResult {
  pow: number;
  digest: Uint8Array;
  computeTimeMs: number;
  attempts: number;
}

// ============================================
// Argon2id Parameters (as per spec)
// ============================================

const ARGON2_TIME_COST = 1;
const ARGON2_MEMORY_COST = 4096; // 4096 KiB
const ARGON2_PARALLELISM = 1;
const ARGON2_OUTPUT_LENGTH = 32;

// ============================================
// Helpers
// ============================================

function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// ============================================
// PoW Computation (TurboModule - Native Loop)
// ============================================

/**
 * Compute Proof of Work using native TurboModule loop
 *
 * This runs the entire PoW loop natively for 6-12x better performance
 */
export async function computePoW(
  input: PoWInput,
  onProgress?: (attempts: number, elapsedMs: number) => void,
  maxAttempts = 10_000_000
): Promise<PoWResult> {
  const { base, lastBlockHash, requiredBits } = input;

  if (requiredBits === 0) {
    return { pow: 0, digest: new Uint8Array(32), computeTimeMs: 0, attempts: 0 };
  }

  const baseHex = bytesToHex(base);
  const saltHex = lastBlockHash.startsWith("0x")
    ? lastBlockHash.slice(2)
    : lastBlockHash;
  const startNonce = Math.floor(Math.random() * 0xffffffff);

  console.log(`[PoW Turbo] Starting with difficulty=${requiredBits} bits`);

  // Set up progress polling if callback provided
  let progressInterval: ReturnType<typeof setInterval> | undefined;
  if (onProgress) {
    progressInterval = setInterval(async () => {
      try {
        const progress = await getPowProgress();
        onProgress(progress.attempts, progress.elapsedMs);
      } catch {
        // Ignore progress errors
      }
    }, 100);
  }

  try {
    const result = await computePowNative({
      base: baseHex,
      salt: saltHex,
      difficulty: requiredBits,
      startNonce,
      maxAttempts,
      timeoutMs: 60000,
      iterations: ARGON2_TIME_COST,
      memory: ARGON2_MEMORY_COST,
      parallelism: ARGON2_PARALLELISM,
      hashLength: ARGON2_OUTPUT_LENGTH,
    });

    console.log(
      `[PoW Turbo] Found! nonce=${result.nonce}, attempts=${result.attempts}, time=${result.elapsedMs}ms`
    );

    return {
      pow: result.nonce,
      digest: hexToUint8Array(result.digest),
      computeTimeMs: result.elapsedMs,
      attempts: result.attempts,
    };
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

/**
 * Cancel ongoing PoW computation
 */
export { cancelPow };

/**
 * Estimate time to compute PoW at given difficulty
 *
 * With TurboModule native loop: ~500-1000 hashes/sec on mobile
 */
export function estimatePoWTime(difficulty: number): number {
  if (difficulty === 0) return 0;

  const expectedAttempts = Math.pow(2, difficulty);
  // TurboModule is much faster: ~500-1000 hashes/sec
  const hashesPerSecond = 500;

  return expectedAttempts / hashesPerSecond;
}
