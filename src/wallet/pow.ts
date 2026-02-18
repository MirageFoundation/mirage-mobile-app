import argon2 from "react-native-argon2";
// @ts-expect-error - resolved by bundler
import { argon2id as argon2idJs } from "@noble/hashes/argon2";

import { bytesToHex, concatBytes } from "./crypto";

const FORCE_JS_POW =
  typeof process !== "undefined" &&
  !!(process as any).env &&
  (((process as any).env.EXPO_PUBLIC_FORCE_JS_POW === "1") || ((process as any).env.FORCE_JS_POW === "1"));

// ============================================
// Types
// ============================================

export interface PoWInput {
  base: Uint8Array;
  lastBlockHash: string;
  powDifficulty: number;
  powBaseBits: number;
  powFactor: number;
}

export interface PoWResult {
  pow: number;
  digest: Uint8Array;
  computeTimeMs: number;
  attempts: number;
}

export interface PoWParams {
  difficulty: number;
  messageHash: Uint8Array;
  timestamp: number;
  lastBlockHash: string;
}

// ============================================
// Argon2id Parameters
// ============================================

const ARGON2_TIME_COST = 1;
const ARGON2_MEMORY_COST = 4096;
const ARGON2_PARALLELISM = 1;
const ARGON2_OUTPUT_LENGTH = 32;
const POW_MAX_SECONDS_ENV =
  (typeof process !== "undefined" && (process as any).env?.EXPO_PUBLIC_POW_MAX_SECONDS) ||
  (typeof process !== "undefined" && (process as any).env?.POW_MAX_SECONDS);
const POW_MAX_SECONDS_DEFAULT = 60;

// ============================================
// Uvarint Encoding
// ============================================

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

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ============================================
// Target-Based Difficulty (v1.11.0)
// ============================================

const BASE_DIFFICULTY_FACTOR = 1000n;
const MAX_SAFE_DIFFICULTY_FACTOR = (1n << 53n) - 1n;

export function difficultyFactor(steps: number, powFactor: number): bigint {
  if (steps === 0) return BASE_DIFFICULTY_FACTOR;
  let factor = 1000;
  for (let i = 0; i < steps; i++) {
    factor *= (1 + powFactor);
  }
  let rounded = BigInt(Math.round(factor));
  if (rounded < BASE_DIFFICULTY_FACTOR) rounded = BASE_DIFFICULTY_FACTOR;
  if (rounded > MAX_SAFE_DIFFICULTY_FACTOR) rounded = MAX_SAFE_DIFFICULTY_FACTOR;
  return rounded;
}

export function checkPowTarget(
  digestBytes: Uint8Array,
  powDifficulty: number,
  powBaseBits: number,
  powFactor: number
): boolean {
  const factor = difficultyFactor(powDifficulty, powFactor);
  const baseTarget = 1n << BigInt(256 - powBaseBits);
  const effectiveTarget = (baseTarget * BASE_DIFFICULTY_FACTOR) / factor;

  let hashInt = 0n;
  for (const byte of digestBytes) {
    hashInt = (hashInt << 8n) | BigInt(byte);
  }

  return hashInt <= effectiveTarget;
}

export function leadingZeroBits(bytes: Uint8Array): number {
  let total = 0;
  for (const b of bytes) {
    if (b === 0) {
      total += 8;
      continue;
    }
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

// ============================================
// PoW Computation
// ============================================

export async function computePoW(
  input: PoWInput,
  onProgress?: (attempts: number, elapsedMs: number) => void,
  maxAttempts = 10_000_000
): Promise<PoWResult> {
  const { base, lastBlockHash, powDifficulty, powBaseBits, powFactor } = input;

  const startTime = Date.now();
  const saltHex = lastBlockHash.startsWith("0x") ? lastBlockHash.slice(2) : lastBlockHash;
  const colon = new TextEncoder().encode(":");
  let pow = Math.floor(Math.random() * 0xffffffff) >>> 0;
  let attempts = 0;

  console.log(`[PoW Native] Starting with powDifficulty=${powDifficulty}, baseBits=${powBaseBits}, factor=${powFactor}`);

  const maxSeconds = POW_MAX_SECONDS_ENV ? Math.max(1, Number(POW_MAX_SECONDS_ENV)) : POW_MAX_SECONDS_DEFAULT;
  const deadline = startTime + maxSeconds * 1000;

  while (attempts < maxAttempts) {
    const passwordBytes = concatBytes(base, colon, uvarint(pow));
    let digest: Uint8Array = new Uint8Array(ARGON2_OUTPUT_LENGTH);

    try {
      if (FORCE_JS_POW) {
        const saltBytes = hexToUint8Array(saltHex);
        digest = argon2idJs(passwordBytes, saltBytes, {
          t: ARGON2_TIME_COST,
          m: ARGON2_MEMORY_COST,
          p: ARGON2_PARALLELISM,
          dkLen: ARGON2_OUTPUT_LENGTH,
        });
      } else {
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
          digest = argon2idJs(passwordBytes, hexToUint8Array(saltHex), {
            t: ARGON2_TIME_COST,
            m: ARGON2_MEMORY_COST,
            p: ARGON2_PARALLELISM,
            dkLen: ARGON2_OUTPUT_LENGTH,
          });
        }
      }
    } catch {
      console.log("[PoW Native] Native argon2 failed; using JS fallback");
      digest = argon2idJs(passwordBytes, hexToUint8Array(saltHex), {
        t: ARGON2_TIME_COST,
        m: ARGON2_MEMORY_COST,
        p: ARGON2_PARALLELISM,
        dkLen: ARGON2_OUTPUT_LENGTH,
      });
    }

    attempts++;
    if (checkPowTarget(digest, powDifficulty, powBaseBits, powFactor)) {
      const computeTimeMs = Date.now() - startTime;
      console.log(`[PoW Native] Found! nonce=${pow}, attempts=${attempts}, time=${computeTimeMs}ms`);
      return { pow, digest, computeTimeMs, attempts };
    }

    pow = (pow + 1) >>> 0;

    if (attempts % 10 === 0) {
      if (onProgress) {
        onProgress(attempts, Date.now() - startTime);
      }
    }

    if (Date.now() >= deadline) {
      throw new Error(`PoW computation failed: timed out after ${maxSeconds}s`);
    }
  }

  throw new Error(`PoW computation failed: exceeded ${maxAttempts} attempts`);
}

// ============================================
// Verify
// ============================================

export async function verifyPoW(input: PoWInput, pow: number): Promise<boolean> {
  const { base, lastBlockHash, powDifficulty, powBaseBits, powFactor } = input;

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
  return checkPowTarget(digest, powDifficulty, powBaseBits, powFactor);
}

// ============================================
// Estimate
// ============================================

export function estimatePoWTime(
  powDifficulty: number,
  powBaseBits: number,
  powFactor: number
): number {
  const factor = Number(difficultyFactor(powDifficulty, powFactor));
  const expectedAttempts = factor * Math.pow(2, powBaseBits) / 1000;
  const hashesPerSecond = 50;
  return expectedAttempts / hashesPerSecond;
}
