type UploadErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  responseText?: unknown;
  cause?: unknown;
};

const collectErrorText = (error: unknown): string => {
  if (!error || typeof error !== "object") return String(error ?? "");
  const value = error as UploadErrorLike;
  return [value.code, value.message, value.responseText, collectErrorText(value.cause)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const getBackendErrorCode = (error: UploadErrorLike | undefined): string | undefined => {
  if (typeof error?.responseText !== "string") return undefined;
  try {
    const body = JSON.parse(error.responseText) as { error_code?: unknown };
    return typeof body.error_code === "string" ? body.error_code : undefined;
  } catch {
    return undefined;
  }
};

const BACKEND_ERROR_MESSAGES: Record<string, string> = {
  uploads_disabled: "Media uploads are currently disabled on this server.",
  media_too_large: "This file is too large to upload.",
  media_invalid_type: "This file format is not supported.",
  media_metadata_required: "The video duration or dimensions could not be read. Try selecting it again.",
  video_too_long: "This video is longer than the server allows.",
  video_resolution_too_high: "This video resolution is too high for its duration.",
  media_provider_not_configured: "Media uploads are not configured on this server.",
  media_store_failed: "The media provider could not finish the upload. Tap Retry to try again.",
};

export type MediaUploadErrorDetails = {
  kind: "timeout" | "network" | "server" | "cancelled" | "unknown";
  message: string;
  status?: number;
};

export function getMediaUploadErrorDetails(error: unknown): MediaUploadErrorDetails {
  const value = error as UploadErrorLike | undefined;
  const status = typeof value?.status === "number" ? value.status : undefined;
  const text = collectErrorText(error);
  const backendErrorCode = getBackendErrorCode(value);

  if (text.includes("abort") || text.includes("cancel")) {
    return { kind: "cancelled", message: "Upload cancelled.", status };
  }
  if (
    text.includes("upload_timeout") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("-1001")
  ) {
    return {
      kind: "timeout",
      message: "The upload reached the server, but it took too long to finish. Tap Retry to try again.",
      status,
    };
  }
  if (
    text.includes("network") ||
    text.includes("not connected") ||
    text.includes("offline") ||
    text.includes("-1009") ||
    text.includes("could not connect")
  ) {
    return {
      kind: "network",
      message: "The upload lost its network connection. Check your connection and tap Retry.",
      status,
    };
  }
  if (status && status >= 400) {
    return {
      kind: "server",
      message: (backendErrorCode && BACKEND_ERROR_MESSAGES[backendErrorCode]) ||
        (status >= 500
          ? "The media server could not finish the upload. Tap Retry to try again."
          : "The media server rejected this upload. Try a different file or tap Retry."),
      status,
    };
  }
  return {
    kind: "unknown",
    message: "The upload could not be completed. Tap Retry to try again.",
    status,
  };
}
