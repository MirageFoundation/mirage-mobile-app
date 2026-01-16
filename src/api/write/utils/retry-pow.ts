/**
 * Retry helper for PoW operations
 * 
 * Automatically retries when backend rejects PoW due to stale block hash.
 * This handles the case where the block hash changes between getting parameters
 * and submitting the signed envelope.
 */

const MAX_POW_RETRIES = 2;

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
      const errorMsg = error?.response?.data?.error || error?.message || "";
      if (errorMsg.includes("insufficient pow") && attempt < MAX_POW_RETRIES) {
        console.log(
          `[${operationName}] PoW rejected (attempt ${attempt + 1}/${MAX_POW_RETRIES + 1}), retrying with fresh params...`
        );
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`${operationName} failed after retries`);
}
