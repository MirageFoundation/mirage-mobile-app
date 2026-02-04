/**
 * Proof of Work computation using react-native-argon2-turbo (TurboModule)
 *
 * This version uses PARALLEL native PoW workers (4 concurrent threads) for 2-4x better performance.
 * The parallelism is handled internally by the native module.
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
// PoW Computation (TurboModule - Parallel Native Workers)
// ============================================

/**
 * Compute Proof of Work using native TurboModule with parallel workers
 *
 * The native module internally runs 4 parallel workers searching different
 * nonce ranges. First worker to find a valid nonce wins, others are cancelled.
 * 
 * Expected performance: ~320-400 h/s effective rate (4x ~80-100 h/s per worker)
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

  console.log(`[PoW Turbo] Starting with difficulty=${requiredBits} bits (4 parallel workers)`);

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

    const hashRate = Math.round(result.attempts / (result.elapsedMs / 1000));
    console.log(
      `[PoW Turbo] Found! nonce=${result.nonce}, attempts=${result.attempts}, time=${result.elapsedMs}ms, rate=${hashRate} h/s`
    );

   return {
     pow: result.nonce < 0 ? (result.nonce >>> 0) : result.nonce,
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
 * Cancel ongoing PoW computation (cancels all parallel workers)
 */
export { cancelPow };

/**
 * Estimate time to compute PoW at given difficulty
 *
 * With 4 parallel workers: ~320-400 hashes/sec effective rate on mobile
 * (4 workers * ~80-100 h/s per worker)
 */
export function estimatePoWTime(difficulty: number): number {
  if (difficulty === 0) return 0;

  const expectedAttempts = Math.pow(2, difficulty);
  // With 4 parallel workers: ~320 effective h/s
  const hashesPerSecond = 320;

  return expectedAttempts / hashesPerSecond;
}
