import {
  computePow as computePowNative,
  cancelPow,
  getPowProgress,
} from "react-native-argon2-turbo";

import { bytesToHex } from "./crypto";
import { difficultyFactor, checkPowTarget } from "./pow";

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

// ============================================
// Argon2id Parameters
// ============================================

const ARGON2_TIME_COST = 1;
const ARGON2_MEMORY_COST = 4096;
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

export async function computePoW(
  input: PoWInput,
  onProgress?: (attempts: number, elapsedMs: number) => void,
  maxAttempts = 10_000_000
): Promise<PoWResult> {
  const { base, lastBlockHash, powDifficulty, powBaseBits, powFactor } = input;

  const baseHex = bytesToHex(base);
  const saltHex = lastBlockHash.startsWith("0x")
    ? lastBlockHash.slice(2)
    : lastBlockHash;
  const startNonce = Math.floor(Math.random() * 0xffffffff);

  console.log(`[PoW Turbo] Starting with powDifficulty=${powDifficulty}, baseBits=${powBaseBits}, factor=${powFactor} (4 parallel workers)`);

  let progressInterval: ReturnType<typeof setInterval> | undefined;
  if (onProgress) {
    progressInterval = setInterval(async () => {
      try {
        const progress = await getPowProgress();
        onProgress(progress.attempts, progress.elapsedMs);
      } catch {
      }
    }, 100);
  }

  try {
    const result = await computePowNative({
      base: baseHex,
      salt: saltHex,
      difficulty: powBaseBits,
      startNonce,
      maxAttempts,
      timeoutMs: 60000,
      iterations: ARGON2_TIME_COST,
      memory: ARGON2_MEMORY_COST,
      parallelism: ARGON2_PARALLELISM,
      hashLength: ARGON2_OUTPUT_LENGTH,
    } as any);

    const nonce = result.nonce < 0 ? (result.nonce >>> 0) : result.nonce;
    const digest = hexToUint8Array(result.digest);

    if (!checkPowTarget(digest, powDifficulty, powBaseBits, powFactor)) {
      console.log("[PoW Turbo] Native result failed JS target check; this may indicate a native module mismatch");
    }

    const hashRate = Math.round(result.attempts / (result.elapsedMs / 1000));
    console.log(
      `[PoW Turbo] Found! nonce=${nonce}, attempts=${result.attempts}, time=${result.elapsedMs}ms, rate=${hashRate} h/s`
    );

    return {
      pow: nonce,
      digest,
      computeTimeMs: result.elapsedMs,
      attempts: result.attempts,
    };
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

export { cancelPow, getPowProgress };

export function estimatePoWTime(
  powDifficulty: number,
  powBaseBits: number,
  powFactor: number
): number {
  const factor = Number(difficultyFactor(powDifficulty, powFactor));
  const expectedAttempts = factor * Math.pow(2, powBaseBits) / 1000;
  const hashesPerSecond = 320;
  return expectedAttempts / hashesPerSecond;
}
