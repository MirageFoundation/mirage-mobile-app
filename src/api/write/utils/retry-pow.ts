/**
 * Retry helper for PoW operations
 * 
 * Automatically retries when backend rejects PoW due to stale block hash.
 * This handles the case where the block hash changes between getting parameters
 * and submitting the signed envelope.
 */

import * as Sentry from "@sentry/react-native";
import { parseApiError } from "@/src/utils/parse-api-error";

const MAX_POW_RETRIES = 3;

function isNativePowTimeoutError(error: unknown): boolean {
  const msg = String((error as any)?.message || error || "");
  return (
    /pow computation failed: timed out/i.test(msg) ||
    /pow:?\s*native module failed target check/i.test(msg) ||
    /pow computation failed: exceeded \d+ attempts/i.test(msg)
  );
}

/**
 * Execute a function that may fail with "insufficient pow" and retry with fresh parameters
 */
export async function withPowRetry<T>(
  operation: () => Promise<T>,
  operationName: string = "Operation"
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_POW_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const parsed = parseApiError(error);
      const errorCode = parsed.errorCode;
      const isPowRetryable =
        errorCode === "insufficient_pow_precheck" ||
        errorCode === "invalid_last_block_hash";
      // PoW native module can time out when iOS/Android suspends our
      // CPU-bound workers while the app is backgrounded. When we foreground
      // again, the native module rejects with a "timed out" / attempts-cap
      // error. Retry from scratch — the next attempt will fetch a fresh
      // last_block_hash and re-run PoW.
      const isNativeTimeout = isNativePowTimeoutError(error);
      if ((isPowRetryable || isNativeTimeout) && attempt < MAX_POW_RETRIES) {
        Sentry.addBreadcrumb({
          category: "pow-retry",
          message: isNativeTimeout
            ? `${operationName} PoW native timeout/cap, retrying`
            : `${operationName} PoW rejected, retrying`,
          data: {
            attempt: attempt + 1,
            maxAttempts: MAX_POW_RETRIES + 1,
            errorCode,
            nativeTimeout: isNativeTimeout || undefined,
          },
          level: "warning",
        });
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`${operationName} failed after retries`);
}
