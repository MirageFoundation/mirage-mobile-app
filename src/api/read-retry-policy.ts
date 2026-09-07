import { isMaybeRetryable, isRetryable } from "@/src/utils/error-messages";

const completedReads = new WeakSet<object>();

export function isCompletedApiRead(error: unknown): boolean {
  return typeof error === "object" && error !== null && completedReads.has(error);
}

export function markCompletedApiRead(error: unknown): void {
  if (typeof error === "object" && error !== null) completedReads.add(error);
}

export function isReadCancellation(error: unknown): boolean {
  const candidate = error as { code?: string; name?: string };
  return candidate?.code === "ERR_CANCELED" ||
    ["StaleServerResponseError", "AbortError"].includes(candidate?.name ?? "");
}

function isTerminalReadError(error: unknown): boolean {
  const candidate = error as { code?: string; name?: string };
  return isReadCancellation(error) || candidate?.code === "ERR_FR_TOO_MANY_REDIRECTS" ||
    ["SignedContentReadError", "SignedCuratorReadError"].includes(candidate?.name ?? "");
}

export function isRetryableReadError(error: unknown): boolean {
  const candidate = error as { code?: string; name?: string; status?: number; response?: { status?: number; data?: { error_code?: string } } };
  if (isTerminalReadError(error)) return false;
  const status = candidate?.response?.status ?? candidate?.status;
  const code = candidate?.response?.data?.error_code;
  if (status !== undefined) return (status === 429 || status === 503) &&
    (!code || isRetryable(code) || isMaybeRetryable(code));
  return ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(candidate?.code ?? "");
}

export function shouldRetryApiQuery(failureCount: number, error: unknown): boolean {
  if (isCompletedApiRead(error) || isTerminalReadError(error) || failureCount >= 2) return false;
  const candidate = error as { status?: number; response?: { status?: number; data?: { error_code?: string } } };
  const status = candidate?.response?.status ?? candidate?.status;
  const code = candidate?.response?.data?.error_code;
  return isRetryableReadError(error) || (status !== undefined && status >= 500 && status < 600 &&
    (!code || isRetryable(code) || isMaybeRetryable(code)));
}

export function awaitReadTask<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error("Read canceled"), { code: "ERR_CANCELED" }));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export function assertReadActive(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error("Read canceled");
    Object.assign(error, { code: "ERR_CANCELED" });
    throw error;
  }
}

export function waitForReadRetry(delay: number, signal: AbortSignal): Promise<void> {
  assertReadActive(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      try { assertReadActive(signal); } catch (error) { reject(error); }
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function readRetryDelay(error: unknown, attempt: number): number {
  const value = (error as { response?: { headers?: Record<string, unknown> } })?.response?.headers?.["retry-after"];
  const seconds = Number(value);
  const requested = value == null ? NaN : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(value)) - Date.now();
  return Math.min(10_000, Math.max(0, Number.isFinite(requested) ? requested : 1000 * 2 ** (attempt - 1)));
}
