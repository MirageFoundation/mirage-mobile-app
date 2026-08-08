/**
 * Retry helper for PoW operations
 * 
 * Automatically retries when backend rejects PoW due to stale block hash,
 * and (since server v1.32.3) when the relay node lags the chain
 * (`node_catching_up`) or the chain rejects the envelope as too old
 * (`envelope_expired`). Every retry re-runs the full operation, which
 * rebuilds the envelope with a fresh timestamp and nonce — replaying the
 * same envelope would fail again for the same reason.
 */

import * as Sentry from "@sentry/react-native";
import { parseApiError } from "@/src/utils/parse-api-error";

const MAX_POW_RETRIES = 3;
// v1.32.3: node is behind the chain; transient. Wait 2-5s, re-stamp, retry.
const NODE_CATCHING_UP_DELAY_MS = 3_000;
// v1.32.3: chain rejected the envelope as too old. Retry once with a fresh stamp.
const MAX_ENVELOPE_EXPIRED_RETRIES = 1;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a write operation, retrying retryable relay/chain rejections with a
 * freshly built (re-stamped, re-signed) envelope.
 */
export async function withPowRetry<T>(
  operation: () => Promise<T>,
  operationName: string = "Operation"
): Promise<T> {
  let lastError: Error | null = null;
  let envelopeExpiredRetries = 0;

  for (let attempt = 0; attempt <= MAX_POW_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const parsed = parseApiError(error);
      const errorCode = parsed.errorCode;
      const normalizedMessage = parsed.message.toLowerCase();
      const isPowRetryable =
        errorCode === "insufficient_pow_precheck" ||
        errorCode === "invalid_last_block_hash" ||
        normalizedMessage.includes("insufficient pow") ||
        normalizedMessage.includes("invalid last block hash") ||
        normalizedMessage.includes("invalid_last_block_hash");
      const isNodeCatchingUp = errorCode === "node_catching_up";
      const isEnvelopeExpired = errorCode === "envelope_expired";

      if (isEnvelopeExpired && envelopeExpiredRetries >= MAX_ENVELOPE_EXPIRED_RETRIES) {
        throw error;
      }

      if (
        (isPowRetryable || isNodeCatchingUp || isEnvelopeExpired) &&
        attempt < MAX_POW_RETRIES
      ) {
        if (isEnvelopeExpired) {
          envelopeExpiredRetries++;
        }
        Sentry.addBreadcrumb({
          category: "pow-retry",
          message: `${operationName} rejected (${errorCode ?? "pow"}), retrying with fresh envelope`,
          data: {
            attempt: attempt + 1,
            maxAttempts: MAX_POW_RETRIES + 1,
            errorCode,
          },
          level: "warning",
        });
        if (isNodeCatchingUp) {
          await delay(NODE_CATCHING_UP_DELAY_MS);
        }
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`${operationName} failed after retries`);
}
