import {
  computePow as computePowNative,
  cancelPow,
  getPowProgress,
} from "react-native-argon2-turbo";
import * as Sentry from "@sentry/react-native";

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
// Helpers — effective difficulty for native module
// ============================================

function computeEffectiveBits(powDifficulty: number, powBaseBits: number, powFactor: number): number {
  if (powDifficulty === 0) return powBaseBits;
  const factor = Number(difficultyFactor(powDifficulty, powFactor));
  const extraBits = Math.ceil(Math.log2(factor / 1000));
  return powBaseBits + extraBits;
}

// ============================================
// PoW Computation (TurboModule - Parallel Native Workers)
// ============================================

const MAX_NATIVE_RETRIES = 8;
const MAX_POW_COMPUTE_TIME_MS = 60_000;
const POW_TIMEOUT_ERROR_MESSAGE = "Transaction did not work. Please try again.";
const POW_WATCHDOG_TIMEOUT_MESSAGE = "PoW compute watchdog timed out";

function reportPowTimeout(
  reason: string,
  input: PoWInput,
  elapsedMs: number,
  attempts: number,
  retry: number,
): void {
  Sentry.captureMessage("PoW computation timed out", {
    level: "warning",
    tags: { feature: "pow", operation: "compute_pow_timeout" },
    extra: {
      reason,
      elapsedMs,
      attempts,
      retry,
      powDifficulty: input.powDifficulty,
      powBaseBits: input.powBaseBits,
      powFactor: input.powFactor,
    },
  });
}

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

  const effectiveBits = computeEffectiveBits(powDifficulty, powBaseBits, powFactor);
  console.log(`[PoW Turbo] Starting with powDifficulty=${powDifficulty}, baseBits=${powBaseBits}, factor=${powFactor}, effectiveBits=${effectiveBits} (4 parallel workers)`);

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

  const overallStart = Date.now();
  let totalAttempts = 0;

  try {
    for (let retry = 0; retry < MAX_NATIVE_RETRIES; retry++) {
      const elapsedMs = Date.now() - overallStart;
      const remainingMs = MAX_POW_COMPUTE_TIME_MS - elapsedMs;
      if (remainingMs <= 0) {
        cancelPow();
        reportPowTimeout("pre_native_call_limit", input, elapsedMs, totalAttempts, retry);
        throw new Error(POW_TIMEOUT_ERROR_MESSAGE);
      }

      const startNonce = Math.floor(Math.random() * 0xffffffff);
      let result: Awaited<ReturnType<typeof computePowNative>>;
      let watchdogTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const nativeComputation = computePowNative({
          base: baseHex,
          salt: saltHex,
          difficulty: effectiveBits,
          startNonce,
          maxAttempts,
          timeoutMs: remainingMs,
          iterations: ARGON2_TIME_COST,
          memory: ARGON2_MEMORY_COST,
          parallelism: ARGON2_PARALLELISM,
          hashLength: ARGON2_OUTPUT_LENGTH,
        } as any);
        const watchdog = new Promise<never>((_, reject) => {
          watchdogTimeout = setTimeout(
            () => reject(new Error(POW_WATCHDOG_TIMEOUT_MESSAGE)),
            remainingMs,
          );
        });
        result = await Promise.race([nativeComputation, watchdog]);
      } catch (error) {
        const msg = String((error as Error)?.message || error || "");
        if (
          Date.now() - overallStart >= MAX_POW_COMPUTE_TIME_MS ||
          /timeout|timed\s*out/i.test(msg)
        ) {
          const elapsedAfterErrorMs = Date.now() - overallStart;
          cancelPow();
          reportPowTimeout(
            msg === POW_WATCHDOG_TIMEOUT_MESSAGE
              ? "js_watchdog_timeout"
              : "native_timeout_or_limit",
            input,
            elapsedAfterErrorMs,
            totalAttempts,
            retry,
          );
          throw new Error(POW_TIMEOUT_ERROR_MESSAGE);
        }
        throw error;
      } finally {
        if (watchdogTimeout) {
          clearTimeout(watchdogTimeout);
        }
      }

      const nonce = result.nonce < 0 ? (result.nonce >>> 0) : result.nonce;
      const digest = hexToUint8Array(result.digest);
      totalAttempts += result.attempts;

      if (Date.now() - overallStart >= MAX_POW_COMPUTE_TIME_MS) {
        const elapsedAfterResultMs = Date.now() - overallStart;
        cancelPow();
        reportPowTimeout(
          "post_native_result_limit",
          input,
          elapsedAfterResultMs,
          totalAttempts,
          retry,
        );
        throw new Error(POW_TIMEOUT_ERROR_MESSAGE);
      }

      if (checkPowTarget(digest, powDifficulty, powBaseBits, powFactor)) {
        const computeTimeMs = Date.now() - overallStart;
        const hashRate = Math.round(totalAttempts / (computeTimeMs / 1000));
        console.log(
          `[PoW Turbo] Found! nonce=${nonce}, attempts=${totalAttempts}, time=${computeTimeMs}ms, rate=${hashRate} h/s`
        );
        return { pow: nonce, digest, computeTimeMs, attempts: totalAttempts };
      }

      console.log(`[PoW Turbo] Native result failed JS target check (attempt ${retry + 1}/${MAX_NATIVE_RETRIES}), retrying...`);
    }

    throw new Error(`PoW: native module failed target check after ${MAX_NATIVE_RETRIES} attempts`);
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

export { cancelPow, getPowProgress };

export function isPowCancelled(error: unknown): boolean {
  const msg = String((error as Error)?.message || error || "");
  return msg === "pow_cancelled" || msg.includes("PoW computation was cancelled");
}

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
