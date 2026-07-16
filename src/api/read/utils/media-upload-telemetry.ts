export type UploadErrorClass =
  | "aborted"
  | "timeout"
  | "network"
  | "http_4xx"
  | "http_5xx"
  | "unknown";

export function classifyUploadError(error: unknown): UploadErrorClass {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Upload aborted" || message === "Video upload aborted") return "aborted";
  if (message.toLowerCase().includes("timed out")) return "timeout";
  const status = (error as { status?: number } | null)?.status;
  if (status && status >= 400 && status < 500) return "http_4xx";
  if (status && status >= 500) return "http_5xx";
  if (
    message.toLowerCase().includes("network") ||
    message.includes("no result") ||
    (error as { code?: string } | null)?.code === "ERR_NETWORK"
  ) {
    return "network";
  }
  return "unknown";
}

export function sanitizeRemoteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return undefined;
  }
}
