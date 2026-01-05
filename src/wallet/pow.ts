/**
 * Proof of Work computation for Mirage transactions
 *
 * Free tier users must compute PoW to submit transactions.
 * Paid tier users can skip PoW (difficulty = 0, pow = 0).
 *
 * This module will be fully implemented with the Write API.
 * For now, it provides the interface and basic structure.
 */

// @ts-expect-error - bundler resolves this correctly at runtime
import { sha256 } from "@noble/hashes/sha2";

import { bytesToHex, concatBytes, hexToBytes } from "./crypto";

// ============================================
// Types
// ============================================

export interface PoWParams {
  /** Difficulty level (number of leading zero bits required) */
  difficulty: number;
  /** Message data to include in PoW computation */
  messageHash: Uint8Array;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Latest block hash (hex string) */
  lastBlockHash: string;
}

export interface PoWResult {
  /** Nonce that satisfies the difficulty requirement */
  nonce: number;
  /** Time taken to compute in milliseconds */
  computeTimeMs: number;
  /** Number of attempts made */
  attempts: number;
}

// ============================================
// PoW Computation
// ============================================

/**
 * Compute Proof of Work for a transaction
 *
 * The PoW algorithm:
 * 1. Concatenate: messageHash + timestamp (8 bytes BE) + lastBlockHash + nonce (4 bytes BE)
 * 2. SHA256 hash the concatenation
 * 3. Check if hash has required leading zero bits
 * 4. Increment nonce and repeat until found
 *
 * @param params - PoW parameters
 * @param maxAttempts - Maximum attempts before giving up (default: 10M)
 * @returns PoW result with valid nonce
 * @throws Error if max attempts exceeded
 */
export function computePoW(params: PoWParams, maxAttempts = 10_000_000): PoWResult {
  const { difficulty, messageHash, timestamp, lastBlockHash } = params;

  // If difficulty is 0, no PoW needed (paid tier)
  if (difficulty === 0) {
    return { nonce: 0, computeTimeMs: 0, attempts: 0 };
  }

  const startTime = Date.now();
  const blockHashBytes = hexToBytes(lastBlockHash);

  // Timestamp as 8-byte big-endian
  const timestampBytes = new Uint8Array(8);
  const view = new DataView(timestampBytes.buffer);
  view.setBigUint64(0, BigInt(timestamp), false); // big-endian

  // Base data without nonce
  const baseData = concatBytes(messageHash, timestampBytes, blockHashBytes);

  for (let nonce = 0; nonce < maxAttempts; nonce++) {
    // Nonce as 4-byte big-endian
    const nonceBytes = new Uint8Array(4);
    const nonceView = new DataView(nonceBytes.buffer);
    nonceView.setUint32(0, nonce, false); // big-endian

    // Concatenate and hash
    const data = concatBytes(baseData, nonceBytes);
    const hash = sha256(data);

    // Check leading zeros
    if (hasLeadingZeroBits(hash, difficulty)) {
      return {
        nonce,
        computeTimeMs: Date.now() - startTime,
        attempts: nonce + 1,
      };
    }
  }

  throw new Error(`PoW computation failed: exceeded ${maxAttempts} attempts`);
}

/**
 * Check if hash has required number of leading zero bits
 *
 * @param hash - Hash to check
 * @param bits - Required number of leading zero bits
 * @returns true if hash has enough leading zeros
 */
function hasLeadingZeroBits(hash: Uint8Array, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  const remainingBits = bits % 8;

  // Check full zero bytes
  for (let i = 0; i < fullBytes; i++) {
    if (hash[i] !== 0) return false;
  }

  // Check remaining bits in next byte
  if (remainingBits > 0) {
    const mask = 0xff << (8 - remainingBits);
    if ((hash[fullBytes] & mask) !== 0) return false;
  }

  return true;
}

/**
 * Estimate time to compute PoW at given difficulty
 *
 * Based on expected number of attempts: 2^difficulty
 * Assumes ~100k hashes/second on mobile device
 *
 * @param difficulty - PoW difficulty level
 * @returns Estimated time in seconds
 */
export function estimatePoWTime(difficulty: number): number {
  if (difficulty === 0) return 0;

  const expectedAttempts = Math.pow(2, difficulty);
  const hashesPerSecond = 100_000; // Conservative estimate for mobile

  return expectedAttempts / hashesPerSecond;
}

/**
 * Verify a PoW nonce is valid for given parameters
 *
 * @param params - Original PoW parameters
 * @param nonce - Nonce to verify
 * @returns true if nonce produces valid hash
 */
export function verifyPoW(params: PoWParams, nonce: number): boolean {
  const { difficulty, messageHash, timestamp, lastBlockHash } = params;

  if (difficulty === 0) return true;

  const blockHashBytes = hexToBytes(lastBlockHash);

  // Timestamp as 8-byte big-endian
  const timestampBytes = new Uint8Array(8);
  const view = new DataView(timestampBytes.buffer);
  view.setBigUint64(0, BigInt(timestamp), false);

  // Nonce as 4-byte big-endian
  const nonceBytes = new Uint8Array(4);
  const nonceView = new DataView(nonceBytes.buffer);
  nonceView.setUint32(0, nonce, false);

  // Concatenate and hash
  const data = concatBytes(messageHash, timestampBytes, blockHashBytes, nonceBytes);
  const hash = sha256(data);

  return hasLeadingZeroBits(hash, difficulty);
}
