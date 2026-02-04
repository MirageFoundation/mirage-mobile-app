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

import argon2 from "react-native-argon2";
// Fallback JS implementation (works in RN too, slower than native but reliable)
// @ts-expect-error - resolved by bundler
import { argon2id as argon2idJs } from "@noble/hashes/argon2";

import { bytesToHex, concatBytes } from "./crypto";
// Allow forcing JS Argon2 via env for dev/simulators
// Set EXPO_PUBLIC_FORCE_JS_POW=1 or FORCE_JS_POW=1 to prefer JS implementation
const FORCE_JS_POW =
  typeof process !== "undefined" &&
  !!(process as any).env &&
  (((process as any).env.EXPO_PUBLIC_FORCE_JS_POW === "1") || ((process as any).env.FORCE_JS_POW === "1"));

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
// Optional time limit (seconds) for PoW, default 60s like web
const POW_MAX_SECONDS_ENV =
  (typeof process !== "undefined" && (process as any).env?.EXPO_PUBLIC_POW_MAX_SECONDS) ||
  (typeof process !== "undefined" && (process as any).env?.POW_MAX_SECONDS);
const POW_MAX_SECONDS_DEFAULT = 60;

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
// Helpers
// ============================================

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
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
 * Compute Proof of Work using Argon2id (native implementation)
 *
 * Algorithm:
 * 1. password = base + ":" + uvarint(pow)
 * 2. salt = hexToBytes(lastBlockHash)
 * 3. digest = argon2id(password, salt, params)
 * 4. Check if digest has required leading zero bits
 * 5. Increment pow and repeat until found
 *
 * @param input - PoW input parameters
 * @param onProgress - Optional callback for progress updates
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
  const saltHex = lastBlockHash.startsWith("0x") ? lastBlockHash.slice(2) : lastBlockHash;
  const colon = new TextEncoder().encode(":");
  // Randomize starting nonce (matches web behavior; avoids repeated retries starting at 0)
  let pow = Math.floor(Math.random() * 0xffffffff) >>> 0;
  let attempts = 0;

  console.log(`[PoW Native] Starting with difficulty=${requiredBits} bits`);

  const maxSeconds = POW_MAX_SECONDS_ENV ? Math.max(1, Number(POW_MAX_SECONDS_ENV)) : POW_MAX_SECONDS_DEFAULT;
  const deadline = startTime + maxSeconds * 1000;

  while (attempts < maxAttempts) {
    // password = base + ":" + uvarint(pow)
    const passwordBytes = concatBytes(base, colon, uvarint(pow));
    let digest: Uint8Array = new Uint8Array(ARGON2_OUTPUT_LENGTH);

    try {
      if (FORCE_JS_POW) {
        // Dev override: use JS Argon2 path unconditionally
        const saltBytes = hexToUint8Array(saltHex);
        digest = argon2idJs(passwordBytes, saltBytes, {
          t: ARGON2_TIME_COST,
          m: ARGON2_MEMORY_COST,
          p: ARGON2_PARALLELISM,
          dkLen: ARGON2_OUTPUT_LENGTH,
        });
      } else {
        // Use hex encoding to safely transport arbitrary bytes (including `0x00`) over the RN bridge.
        // Native module decodes hex -> bytes before hashing, matching backend + web worker behaviour.
        const passwordHex = bytesToHex(passwordBytes);
        const result = await argon2(passwordHex, saltHex, {
          iterations: ARGON2_TIME_COST,
          memory: ARGON2_MEMORY_COST,
          parallelism: ARGON2_PARALLELISM,
          hashLength: ARGON2_OUTPUT_LENGTH,
          mode: "argon2id",
          saltEncoding: "hex",
          passwordEncoding: "hex",
        });
        const rawHex = (result as any)?.rawHash as string | undefined;
        if (rawHex && rawHex.length === ARGON2_OUTPUT_LENGTH * 2) {
          digest = hexToUint8Array(rawHex);
        } else {
          console.log("[PoW Native] Unexpected native output shape; falling back to JS argon2");
          // Unexpected output; use JS fallback
          digest = argon2idJs(passwordBytes, hexToUint8Array(saltHex), {
            t: ARGON2_TIME_COST,
            m: ARGON2_MEMORY_COST,
            p: ARGON2_PARALLELISM,
            dkLen: ARGON2_OUTPUT_LENGTH,
          });
        }
      }
    } catch {
      // Native failed; try JS fallback (slower but reliable)
      console.log("[PoW Native] Native argon2 failed; using JS fallback");
      digest = argon2idJs(passwordBytes, hexToUint8Array(saltHex), {
        t: ARGON2_TIME_COST,
        m: ARGON2_MEMORY_COST,
        p: ARGON2_PARALLELISM,
        dkLen: ARGON2_OUTPUT_LENGTH,
      });
    }

    // Check if we have enough leading zeros
    const zeroBits = leadingZeroBits(digest);
    attempts++;
    if (zeroBits >= requiredBits) {
      const computeTimeMs = Date.now() - startTime;
      console.log(`[PoW Native] Found! nonce=${pow}, attempts=${attempts}, time=${computeTimeMs}ms`);
      return {
        pow,
        digest,
        computeTimeMs,
        attempts,
      };
    }

    pow = (pow + 1) >>> 0;

    // Progress callback
    if (attempts % 10 === 0) {
      if (onProgress) {
        onProgress(attempts, Date.now() - startTime);
      }
    }

    // Time-based stop (align with web: 60s default)
    if (Date.now() >= deadline) {
      throw new Error(`PoW computation failed: timed out after ${maxSeconds}s`);
    }
  }

  throw new Error(`PoW computation failed: exceeded ${maxAttempts} attempts`);
}

/**
 * Verify a PoW nonce is valid for given parameters
 */
export async function verifyPoW(input: PoWInput, pow: number): Promise<boolean> {
  const { base, lastBlockHash, requiredBits } = input;

  if (requiredBits === 0) return true;

  const saltHex = lastBlockHash.startsWith("0x") ? lastBlockHash.slice(2) : lastBlockHash;
  const colon = new TextEncoder().encode(":");
  const passwordBytes = concatBytes(base, colon, uvarint(pow));
  const passwordHex = bytesToHex(passwordBytes);

  const result = await argon2(passwordHex, saltHex, {
    iterations: ARGON2_TIME_COST,
    memory: ARGON2_MEMORY_COST,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_OUTPUT_LENGTH,
    mode: "argon2id",
    saltEncoding: "hex",
    passwordEncoding: "hex",
  });

  const digest = hexToUint8Array(result.rawHash);
  return leadingZeroBits(digest) >= requiredBits;
}

/**
 * Estimate time to compute PoW at given difficulty
 *
 * Based on expected number of attempts: 2^difficulty
 * With native Argon2id: ~50-100 hashes/second on mobile
 *
 * @param difficulty - PoW difficulty level (leading zero bits)
 * @returns Estimated time in seconds
 */
export function estimatePoWTime(difficulty: number): number {
  if (difficulty === 0) return 0;

  const expectedAttempts = Math.pow(2, difficulty);
  // Native Argon2id is much faster: ~50-100 hashes/sec on mobile
  const hashesPerSecond = 50;

  return expectedAttempts / hashesPerSecond;
}
