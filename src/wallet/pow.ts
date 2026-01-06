/**
 * Proof of Work computation for Mirage transactions
 *
 * Free tier users must compute PoW to submit transactions.
 * Paid tier users can skip PoW (difficulty = 0, pow = 0).
 *
 * Uses Argon2id for memory-hard PoW:
 * - Time cost (t): 1
 * - Memory cost (m): 4096 KiB
 * - Parallelism (p): 1
 * - Output length: 32 bytes
 */

// @ts-expect-error - bundler resolves this correctly at runtime
import { argon2id } from "@noble/hashes/argon2";

import { concatBytes, hexToBytes } from "./crypto";

// ============================================
// Types
// ============================================

export interface PoWInput {
  /** Canonical base bytes (without tag 5) */
  base: Uint8Array;
  /** Latest block hash (hex string) - used as salt */
  lastBlockHash: string;
  /** Required number of leading zero bits */
  requiredBits: number;
}

export interface PoWResult {
  /** Nonce that satisfies the difficulty requirement */
  pow: number;
  /** Argon2id digest that has required leading zeros */
  digest: Uint8Array;
  /** Time taken to compute in milliseconds */
  computeTimeMs: number;
  /** Number of attempts made */
  attempts: number;
}

// Legacy types for backwards compatibility
export interface PoWParams {
  difficulty: number;
  messageHash: Uint8Array;
  timestamp: number;
  lastBlockHash: string;
}

// ============================================
// Argon2id Parameters (as per spec)
// ============================================

const ARGON2_TIME_COST = 1;
const ARGON2_MEMORY_COST = 4096; // 4096 KiB
const ARGON2_PARALLELISM = 1;
const ARGON2_OUTPUT_LENGTH = 32;

// ============================================
// Uvarint Encoding
// ============================================

/**
 * Encode a number as unsigned varint (protobuf-style)
 */
export function uvarint(n: number | bigint): Uint8Array {
  const result: number[] = [];
  let value = typeof n === "bigint" ? n : BigInt(n);

  while (value >= 0x80n) {
    result.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  result.push(Number(value));

  return new Uint8Array(result);
}

// ============================================
// PoW Computation
// ============================================

/**
 * Count leading zero bits in a byte array
 */
export function leadingZeroBits(bytes: Uint8Array): number {
  let total = 0;
  for (const b of bytes) {
    if (b === 0) {
      total += 8;
      continue;
    }
    // Count leading zeros in this byte
    for (let i = 7; i >= 0; i--) {
      if (((b >> i) & 1) === 0) {
        total++;
      } else {
        return total;
      }
    }
  }
  return total;
}

/**
 * Compute Proof of Work using Argon2id
 *
 * Algorithm:
 * 1. password = base + ":" + uvarint(pow)
 * 2. salt = hexToBytes(lastBlockHash)
 * 3. digest = argon2id(password, salt, params)
 * 4. Check if digest has required leading zero bits
 * 5. Increment pow and repeat until found
 *
 * @param input - PoW input parameters
 * @param onProgress - Optional callback for progress updates (called every 10 iterations)
 * @param maxAttempts - Maximum attempts before giving up (default: 10M)
 * @returns PoW result with valid nonce
 */
export async function computePoW(
  input: PoWInput,
  onProgress?: (attempts: number, elapsedMs: number) => void,
  maxAttempts = 10_000_000
): Promise<PoWResult> {
  const { base, lastBlockHash, requiredBits } = input;

  // If no difficulty required, return immediately
  if (requiredBits === 0) {
    return { pow: 0, digest: new Uint8Array(32), computeTimeMs: 0, attempts: 0 };
  }

  const startTime = Date.now();
  const salt = hexToBytes(lastBlockHash);
  const colon = new TextEncoder().encode(":");
  let pow = 0;

  while (pow < maxAttempts) {
    // password = base + ":" + uvarint(pow)
    const password = concatBytes(base, colon, uvarint(pow));

    // Compute Argon2id
    const digest = argon2id(password, salt, {
      t: ARGON2_TIME_COST,
      m: ARGON2_MEMORY_COST,
      p: ARGON2_PARALLELISM,
      dkLen: ARGON2_OUTPUT_LENGTH,
    });

    // Check if we have enough leading zeros
    const zeroBits = leadingZeroBits(digest);
    if (zeroBits >= requiredBits) {
      return {
        pow,
        digest,
        computeTimeMs: Date.now() - startTime,
        attempts: pow + 1,
      };
    }

    pow++;

    // Progress callback and yield to event loop
    if (pow % 10 === 0) {
      if (onProgress) {
        onProgress(pow, Date.now() - startTime);
      }
      // Yield to event loop to avoid blocking UI
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw new Error(`PoW computation failed: exceeded ${maxAttempts} attempts`);
}

/**
 * Verify a PoW nonce is valid for given parameters
 */
export function verifyPoW(input: PoWInput, pow: number): boolean {
  const { base, lastBlockHash, requiredBits } = input;

  if (requiredBits === 0) return true;

  const salt = hexToBytes(lastBlockHash);
  const colon = new TextEncoder().encode(":");
  const password = concatBytes(base, colon, uvarint(pow));

  const digest = argon2id(password, salt, {
    t: ARGON2_TIME_COST,
    m: ARGON2_MEMORY_COST,
    p: ARGON2_PARALLELISM,
    dkLen: ARGON2_OUTPUT_LENGTH,
  });

  return leadingZeroBits(digest) >= requiredBits;
}

/**
 * Estimate time to compute PoW at given difficulty
 *
 * Based on expected number of attempts: 2^difficulty
 * Assumes ~10 hashes/second on mobile device (Argon2id is slow)
 *
 * @param difficulty - PoW difficulty level (leading zero bits)
 * @returns Estimated time in seconds
 */
export function estimatePoWTime(difficulty: number): number {
  if (difficulty === 0) return 0;

  const expectedAttempts = Math.pow(2, difficulty);
  // Argon2id is much slower than SHA256 - ~10 hashes/sec on mobile
  const hashesPerSecond = 10;

  return expectedAttempts / hashesPerSecond;
}

// ============================================
// Legacy API (for backwards compatibility)
// ============================================

/**
 * @deprecated Use computePoW with PoWInput instead
 */
export function computePoWLegacy(
  params: PoWParams,
  maxAttempts = 10_000_000
): { nonce: number; computeTimeMs: number; attempts: number } {
  const { difficulty, messageHash, lastBlockHash } = params;

  if (difficulty === 0) {
    return { nonce: 0, computeTimeMs: 0, attempts: 0 };
  }

  // This is a synchronous version for backwards compatibility
  // In new code, use the async computePoW function
  const startTime = Date.now();
  const salt = hexToBytes(lastBlockHash);
  const colon = new TextEncoder().encode(":");

  for (let nonce = 0; nonce < maxAttempts; nonce++) {
    const password = concatBytes(messageHash, colon, uvarint(nonce));

    const digest = argon2id(password, salt, {
      t: ARGON2_TIME_COST,
      m: ARGON2_MEMORY_COST,
      p: ARGON2_PARALLELISM,
      dkLen: ARGON2_OUTPUT_LENGTH,
    });

    if (leadingZeroBits(digest) >= difficulty) {
      return {
        nonce,
        computeTimeMs: Date.now() - startTime,
        attempts: nonce + 1,
      };
    }
  }

  throw new Error(`PoW computation failed: exceeded ${maxAttempts} attempts`);
}
