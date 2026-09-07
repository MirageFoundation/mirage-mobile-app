import type { WriteResponse } from "../signing";

export const INDEXER_SETTLEMENT_OVERALL_MS = 30_000;
export const INDEXER_SETTLEMENT_PER_READ_MS = 5_000;
export const INDEXER_SETTLEMENT_DELAYS_MS = [750, 1_000, 1_500, 2_250] as const;
export const INDEXER_SETTLEMENT_DELAY_CAP_MS = 3_000;

export type IndexerSettlementStatus = "settled" | "timeout";

export type IndexerSettlementResult<T = unknown> = {
  status: IndexerSettlementStatus;
  value?: T;
};

export type SettledWriteResult<TIndexed = unknown> = {
  delivery: WriteResponse;
  settlement: IndexerSettlementResult<TIndexed>;
};

export type WaitForIndexedConditionOptions<T> = {
  read: (signal: AbortSignal) => Promise<T>;
  matches: (value: T) => boolean;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  overallTimeoutMs?: number;
  perReadTimeoutMs?: number;
  delays?: readonly number[];
  delayCapMs?: number;
};

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function mergeAbortSignals(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => {
    if (!controller.signal.aborted) controller.abort(parent?.reason);
  };
  if (parent?.aborted) {
    controller.abort(parent.reason);
  } else {
    parent?.addEventListener("abort", onParentAbort);
  }
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      const timeoutError = new Error("Indexer read timed out");
      timeoutError.name = "TimeoutError";
      controller.abort(timeoutError);
    }
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

function delayForAttempt(
  attemptIndex: number,
  delays: readonly number[],
  delayCapMs: number,
): number {
  return attemptIndex < delays.length ? delays[attemptIndex]! : delayCapMs;
}

/**
 * Poll an injected read until `matches` is true or the overall window elapses.
 * Immediate first read. Transient read failures retry. Caller abort stops.
 * A confirming read that matches after the deadline still settles.
 */
export async function waitForIndexedCondition<T>(
  options: WaitForIndexedConditionOptions<T>,
): Promise<IndexerSettlementResult<T>> {
  const {
    read,
    matches,
    signal,
    now = Date.now,
    sleep = sleepWithSignal,
    overallTimeoutMs = INDEXER_SETTLEMENT_OVERALL_MS,
    perReadTimeoutMs = INDEXER_SETTLEMENT_PER_READ_MS,
    delays = INDEXER_SETTLEMENT_DELAYS_MS,
    delayCapMs = INDEXER_SETTLEMENT_DELAY_CAP_MS,
  } = options;

  throwIfAborted(signal);
  const deadline = now() + overallTimeoutMs;
  let delayIndex = 0;
  let lastValue: T | undefined;
  let confirming = false;

  const attemptRead = async (): Promise<"matched" | "pending"> => {
    throwIfAborted(signal);
    const perRead = mergeAbortSignals(signal, perReadTimeoutMs);
    try {
      const value = await read(perRead.signal);
      lastValue = value;
      if (matches(value)) return "matched";
      return "pending";
    } catch {
      throwIfAborted(signal);
      return "pending";
    } finally {
      perRead.cleanup();
    }
  };

  while (true) {
    throwIfAborted(signal);
    const result = await attemptRead();
    if (result === "matched") {
      return { status: "settled", value: lastValue };
    }
    throwIfAborted(signal);

    if (confirming || now() >= deadline) {
      if (confirming) {
        return { status: "timeout", value: lastValue };
      }
      confirming = true;
      continue;
    }

    const delay = delayForAttempt(delayIndex, delays, delayCapMs);
    delayIndex += 1;
    const remaining = deadline - now();
    if (remaining <= 0) {
      confirming = true;
      continue;
    }
    await sleep(Math.min(delay, remaining), signal);
  }
}

export function assertWriteDelivered(response: WriteResponse): WriteResponse {
  if (response.code !== 0) {
    throw new Error(response.raw_log || "write delivery failed");
  }
  return response;
}
