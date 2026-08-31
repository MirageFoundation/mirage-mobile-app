/**
 * Media Upload Endpoints
 *
 * POST /upload_media - Upload media through the mobile backend
 */

import { apiClient } from "@/src/api/client";
import * as Sentry from "@sentry/react-native";
import { AppState, Platform } from "react-native";
import {
  backgroundUpload,
  Image as CompressorImage,
  getVideoMetaData,
  UploaderHttpMethod,
  UploadType,
} from "react-native-compressor";
import { classifyUploadError } from "@/src/api/read/utils/media-upload-telemetry";

// ============================================
// Types
// ============================================

export type MediaType = "image" | "video";

interface UploadMediaResponse {
  url?: string;
  asset_id?: string;
  kind?: MediaType;
  id?: string;
  accountHash?: string;
  account_hash?: string;
  uid?: string;
  streamCustomer?: string;
  stream_customer?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  downloadUrl?: string;
  download_url?: string;
  posterUrl?: string;
  poster_url?: string;
}

type UploadMediaParameters = Record<string, string>;

// ============================================
// Constants
// ============================================

const MAX_UPLOAD_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const IMAGE_UPLOAD_TIMEOUT_MS = 180_000;
const VIDEO_UPLOAD_TIMEOUT_MS = 720_000;
const IMAGE_UPLOAD_MAX_WIDTH = 3840;
const IMAGE_UPLOAD_MAX_HEIGHT = 2160;
const IMAGE_UPLOAD_QUALITY = 0.92;

function captureMediaUploadException(
  error: unknown,
  mediaType: MediaType,
  stage: string,
  contentType: string,
  extra?: Record<string, unknown>
) {
  // User-initiated aborts are expected cancellations, not failures.
  const errorClass = classifyUploadError(error);
  if (errorClass === "aborted") return;
  Sentry.addBreadcrumb({
    category: "media-upload",
    message: "Media upload failed",
    level: errorClass === "unknown" ? "error" : "warning",
    data: {
      mediaType,
      stage,
      errorClass,
      contentType,
      attemptsMade: (error as { attemptsMade?: number }).attemptsMade,
      ...extra,
    },
  });
  if (errorClass !== "unknown") return;
  Sentry.captureException(error instanceof Error ? new Error(error.message) : new Error("Unknown media upload failure"), {
    level: "error",
    tags: {
      feature: "media-upload",
      media_type: mediaType,
      stage,
      error_class: errorClass,
    },
    extra: { contentType, ...extra },
  });
}

function getUploadErrorCode(responseText: string): string | undefined {
  try {
    const parsed = responseText ? JSON.parse(responseText) : undefined;
    if (!parsed || typeof parsed !== "object") return undefined;
    const error = parsed as { error_code?: unknown; code?: unknown };
    const code = error.error_code ?? error.code;
    return code === undefined ? undefined : String(code);
  } catch {
    return undefined;
  }
}

function buildUploadError(status: number, responseText: string): Error {
  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    data = responseText;
  }
  const parsedError =
    typeof data === "object" && data !== null
      ? data as { error?: unknown; error_code?: unknown; message?: unknown }
      : undefined;
  const errorCode =
    parsedError?.error ?? parsedError?.error_code ?? parsedError?.message;
  const message =
    errorCode !== undefined
      ? String(errorCode)
      : `Upload failed: ${status}`;
  return Object.assign(new Error(message), {
    status,
    responseText,
    response: { status, data },
  });
}

function parseUploadMediaResponse(responseText: string): UploadMediaResponse {
  const parsed = responseText ? JSON.parse(responseText) : {};
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Upload service returned an invalid response.");
  }
  return parsed as UploadMediaResponse;
}

async function prepareImageForUpload(
  localUri: string,
  contentType: string,
): Promise<{ uri: string; contentType: string }> {
  if (contentType === "image/gif") {
    return { uri: localUri, contentType };
  }

  try {
    const startedAt = Date.now();
    const compressedUri = await CompressorImage.compress(localUri, {
      compressionMethod: "manual",
      maxWidth: IMAGE_UPLOAD_MAX_WIDTH,
      maxHeight: IMAGE_UPLOAD_MAX_HEIGHT,
      quality: IMAGE_UPLOAD_QUALITY,
      output: "jpg",
    });
    console.log("[MediaUpload] Image prepared for upload", {
      durationMs: Date.now() - startedAt,
    });
    return { uri: compressedUri, contentType: "image/jpeg" };
  } catch {
    console.warn("[MediaUpload] Image compression failed; uploading original");
    Sentry.addBreadcrumb({
      category: "media-upload",
      message: "Image compression failed; uploading original",
      level: "warning",
      data: {
        contentType,
        errorClass: "compression",
      },
    });
    return { uri: localUri, contentType };
  }
}

async function getVideoUploadParameters(localUri: string): Promise<UploadMediaParameters> {
  const startedAt = Date.now();
  const meta = await getVideoMetaData(localUri);
  const duration = Math.round(Number(meta.duration) || 0);
  const width = Math.round(Number(meta.width) || 0);
  const height = Math.round(Number(meta.height) || 0);

  console.log("[VideoTiming] metadata complete", {
    durationMs: Date.now() - startedAt,
    duration,
    width,
    height,
  });
  Sentry.addBreadcrumb({
    category: "media-upload",
    message: "Video metadata ready",
    level: "info",
    data: {
      elapsedMs: Date.now() - startedAt,
      durationSeconds: duration,
      width,
      height,
    },
  });

  if (!duration || !height) {
    throw new Error("Could not read video duration and height for upload.");
  }

  return {
    duration: String(duration),
    width: String(width),
    height: String(height),
  };
}

function normalizeFileUri(uri: string): string {
  if (!uri.startsWith("file://") && !uri.startsWith("content://") && !uri.startsWith("http")) {
    return `file://${uri}`;
  }
  return uri;
}

function waitForForeground(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        sub.remove();
        resolve();
      }
    });
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxRetries = MAX_UPLOAD_RETRIES,
    baseDelay = RETRY_BASE_DELAY_MS,
    label = "upload",
    signal,
  }: {
    maxRetries?: number;
    baseDelay?: number;
    label?: string;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  let lastError: unknown;
  let attemptsMade = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error("Upload aborted");
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attemptsMade = attempt + 1;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "Upload aborted") throw error;
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        Object.assign(error as object, { attemptsMade });
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[MediaUpload] ${label} retry ${attempt + 1}/${maxRetries} in ${delay}ms`, {
          status,
          error: msg,
        });
        Sentry.addBreadcrumb({
          category: "media-upload",
          message: `${label} retry ${attempt + 1}/${maxRetries}`,
          level: "warning",
          data: {
            delayMs: delay,
            attempt: attempt + 1,
            errorClass: classifyUploadError(error),
            status,
          },
        });
        await waitForForeground();
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  if (lastError instanceof Error || (typeof lastError === "object" && lastError !== null)) {
    Object.assign(lastError as object, { attemptsMade, retriesExhausted: maxRetries > 0 });
  }
  throw lastError;
}

// ============================================
// Endpoints
// ============================================

export async function uploadMedia(
  localUri: string,
  mediaType: MediaType,
  contentType: string,
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal,
  parameters: UploadMediaParameters = {},
): Promise<UploadMediaResponse> {
  const startedAt = Date.now();
  const normalizedUri = normalizeFileUri(localUri);
  const timeoutMs = mediaType === "video" ? VIDEO_UPLOAD_TIMEOUT_MS : IMAGE_UPLOAD_TIMEOUT_MS;
  const uploadUrl = `${apiClient.getApiUrl("/upload_media")}?kind=${encodeURIComponent(mediaType)}`;

  const uploadWithNativeProgress = async (): Promise<UploadMediaResponse> => {
    const reportedMilestones = new Set<number>();
    const uploadController = new AbortController();
    const onAbort = () => uploadController.abort();
    if (signal) {
      if (signal.aborted) throw new Error("Upload aborted");
      signal.addEventListener("abort", onAbort, { once: true });
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        uploadController.abort();
        reject(Object.assign(
          new Error(`${mediaType === "video" ? "Video" : "Image"} upload timed out while waiting for the server.`),
          { code: "upload_timeout" },
        ));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        backgroundUpload(
          uploadUrl,
          normalizedUri,
          {
            uploadType: UploadType.MULTIPART,
            fieldName: "file",
            mimeType: contentType,
            parameters: { kind: mediaType, ...parameters },
            headers: {},
            httpMethod: UploaderHttpMethod.POST,
          },
          (bytesWritten, totalBytes) => {
            if (totalBytes > 0) {
              const progress = Math.min(100, Math.round((bytesWritten / totalBytes) * 100));
              onProgress?.(progress);
              [25, 50, 75, 100].filter(
                (value) => progress >= value && !reportedMilestones.has(value),
              ).forEach((milestone) => {
                reportedMilestones.add(milestone);
                Sentry.addBreadcrumb({
                  category: "media-upload",
                  message: milestone === 100 ? "Upload body complete; waiting for provider" : "Upload progress milestone",
                  level: "info",
                  data: { mediaType, milestone, elapsedMs: Date.now() - startedAt },
                });
              });
            }
          },
          uploadController.signal,
        ),
        timeoutPromise,
      ]) as { status: number; body: string };
      if (!result) throw new Error("Upload returned no result");
      console.log("[MediaUpload] upload_media complete", {
        status: result.status,
        mediaType,
        transport: "native-background-upload",
      });
      if (result.status < 200 || result.status >= 300) {
        const errorCode = getUploadErrorCode(result.body);
        Sentry.addBreadcrumb({
          category: "media-upload",
          message: "upload_media rejected upload",
          level: "warning",
          data: {
            mediaType,
            status: result.status,
            errorCode,
            uploadsDisabled: errorCode === "uploads_disabled",
          },
        });
        throw buildUploadError(result.status, result.body);
      }
      Sentry.addBreadcrumb({
        category: "media-upload",
        message: "upload_media upload complete",
        level: "info",
        data: {
          mediaType,
          status: result.status,
          parameterCount: Object.keys(parameters).length,
          transport: "native-background-upload",
          elapsedMs: Date.now() - startedAt,
        },
      });
      return parseUploadMediaResponse(result.body);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }
  };

  const uploadFn = async (): Promise<UploadMediaResponse> => uploadWithNativeProgress();

  return withRetry(uploadFn, {
    label: `${mediaType}-upload`,
    maxRetries: mediaType === "video" ? 0 : 2,
    signal,
  });
}

function getImageUrl(
  accountHash: string,
  id: string,
  variant: string = "public",
): string {
  return `https://imagedelivery.net/${accountHash}/${id}/${variant}`;
}

// ============================================
// High-level Image Upload
// ============================================

export interface UploadImageResult {
  url: string;
  id: string;
  accountHash: string;
}

export async function uploadImage(
  localUri: string,
  contentType: string = "image/jpeg",
  onProgress?: UploadProgressCallback,
): Promise<UploadImageResult> {
  const uploadStartedAt = Date.now();
  console.log("[MediaUpload] image upload started", { contentType });
  Sentry.addBreadcrumb({
    category: "media-upload",
    message: "Starting image upload",
    level: "info",
    data: {
      contentType,
    },
  });

  try {
    onProgress?.(0, "processing");
    const preparedImage = await prepareImageForUpload(localUri, contentType);
    onProgress?.(100, "processing");
    onProgress?.(0, "uploading");
    const uploadResponse = await uploadMedia(
      preparedImage.uri,
      "image",
      preparedImage.contentType,
      (progress) => {
        onProgress?.(progress, "uploading");
      },
    );
    console.log("[MediaUpload] File uploaded successfully");
    const accountHash = uploadResponse.accountHash ?? uploadResponse.account_hash;
    const assetId = uploadResponse.asset_id ?? uploadResponse.id;
    const finalUrl = uploadResponse.url ?? (accountHash && assetId
      ? getImageUrl(accountHash, assetId)
      : "");
    if (!finalUrl) throw new Error("Upload service did not return an image URL.");
    Sentry.addBreadcrumb({
      category: "media-upload",
      message: "Image upload complete",
      level: "info",
      data: {
        totalDurationMs: Date.now() - uploadStartedAt,
        hasAssetId: !!assetId,
        hasFinalUrl: true,
      },
    });

    return {
      url: finalUrl,
      id: assetId ?? finalUrl,
      accountHash: uploadResponse.accountHash ?? uploadResponse.account_hash ?? "",
    };
  } catch (error) {
    console.error("[MediaUpload] Image upload failed", {
      errorClass: classifyUploadError(error),
      status: (error as { status?: number }).status,
    });
    captureMediaUploadException(error, "image", "upload-file", contentType, {
      status: (error as { status?: number }).status,
      errorCode: getUploadErrorCode((error as { responseText?: string }).responseText ?? ""),
    });
    throw error;
  }

}

// ============================================
// Content Type Detection
// ============================================

export function getContentTypeFromUri(uri: string): string {
  const extension = uri.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

// ============================================
// Video Upload Functions
// ============================================

export interface UploadProgressCallback {
  (progress: number, phase?: MediaUploadPhase): void;
}

export type MediaUploadPhase = "processing" | "uploading";

export interface UploadVideoResult {
  url: string;
  uid: string;
  thumbnailUrl: string;
}

/**
 * Derive the Bunny Stream thumbnail URL from a playback URL.
 * `https://{pull-zone}.b-cdn.net/{guid}/playlist.m3u8` -> `.../{guid}/thumbnail.jpg`
 */
function deriveVideoThumbnailUrl(playbackUrl: string): string {
  try {
    const parsed = new URL(playbackUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return "";
    segments[segments.length - 1] = "thumbnail.jpg";
    parsed.pathname = `/${segments.join("/")}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export async function uploadVideo(
  localUri: string,
  contentType: string = "video/mp4",
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal
): Promise<UploadVideoResult> {
  const uploadStartedAt = Date.now();
  console.log("[VideoUpload] video upload started", { contentType, platform: Platform.OS });
  console.log("[VideoTiming] upload start", {
    contentType,
    platform: Platform.OS,
  });
  Sentry.addBreadcrumb({
    category: "media-upload",
    message: "Starting video upload",
    level: "info",
    data: {
      contentType,
      platform: Platform.OS,
    },
  });

  try {
    onProgress?.(100, "processing");
    const uploadUrlStartedAt = Date.now();
    const videoParameters = await getVideoUploadParameters(localUri);
    onProgress?.(0, "uploading");
    const uploadResponse = await uploadMedia(
      localUri,
      "video",
      contentType,
      (progress) => {
        onProgress?.(progress, "uploading");
      },
      signal,
      videoParameters,
    );
    const uploadUrlDurationMs = Date.now() - uploadUrlStartedAt;
    console.log("[VideoTiming] upload URL ready", {
      durationMs: uploadUrlDurationMs,
      totalDurationMs: Date.now() - uploadStartedAt,
      uid: uploadResponse.uid,
    });
    Sentry.addBreadcrumb({
      category: "media-upload",
      message: "Video upload URL ready",
      level: "info",
      data: {
        durationMs: uploadUrlDurationMs,
        totalDurationMs: Date.now() - uploadStartedAt,
        uid: uploadResponse.uid,
        provider: "upload_media",
      },
    });
    console.log("[VideoUpload] File uploaded successfully");

    const assetId = uploadResponse.asset_id ?? uploadResponse.uid;
    const finalUrl = uploadResponse.url;
    if (!finalUrl) {
      throw new Error("Upload service did not return a video URL.");
    }
    const thumbnailUrl =
      uploadResponse.thumbnailUrl ??
      uploadResponse.thumbnail_url ??
      uploadResponse.posterUrl ??
      uploadResponse.poster_url ??
      deriveVideoThumbnailUrl(finalUrl);
    const totalUploadDurationMs = Date.now() - uploadStartedAt;
    console.log("[VideoTiming] upload complete", {
      uid: assetId,
      totalDurationMs: totalUploadDurationMs,
      hasFinalUrl: !!finalUrl,
    });
    Sentry.addBreadcrumb({
      category: "media-upload",
      message: "Video upload complete",
      level: "info",
      data: {
        uid: assetId,
        totalDurationMs: totalUploadDurationMs,
        hasFinalUrl: !!finalUrl,
      },
    });
    if (totalUploadDurationMs > 30000) {
      Sentry.addBreadcrumb({
        category: "media-upload",
        message: "Video upload was slow",
        level: "warning",
        data: {
          uid: assetId,
          totalDurationMs: totalUploadDurationMs,
          hasFinalUrl: !!finalUrl,
        },
      });
    }

    return {
      url: finalUrl,
      uid: assetId ?? finalUrl,
      thumbnailUrl,
    };
  } catch (error) {
    console.error("[VideoUpload] Video upload failed", {
      errorClass: classifyUploadError(error),
      status: (error as { status?: number }).status,
    });
    captureMediaUploadException(error, "video", "upload-file", contentType, {
      status: (error as { status?: number }).status,
      errorCode: getUploadErrorCode((error as { responseText?: string }).responseText ?? ""),
    });
    throw error;
  }
}

export function isVideoFile(uri: string): boolean {
  const contentType = getContentTypeFromUri(uri);
  return contentType.startsWith("video/");
}
