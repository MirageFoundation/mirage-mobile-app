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
      if (isPowRetryable && attempt < MAX_POW_RETRIES) {
        Sentry.addBreadcrumb({
          category: "pow-retry",
          message: `${operationName} PoW rejected, retrying`,
          data: {
            attempt: attempt + 1,
            maxAttempts: MAX_POW_RETRIES + 1,
            errorCode,
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
