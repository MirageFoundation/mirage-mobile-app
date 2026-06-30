/**
 * Media Upload Endpoints
 *
 * POST /upload_media - Upload media through the mobile backend
 */

import { api, apiClient } from "@/src/api/client";
import * as Sentry from "@sentry/react-native";
import {
  createUploadTask,
  FileSystemUploadType,
  FileSystemSessionType,
} from "expo-file-system/legacy";
import type { FileSystemUploadResult } from "expo-file-system/legacy";
import { AppState, Platform } from "react-native";
import { Image as CompressorImage, getVideoMetaData } from "react-native-compressor";
import type { ImageUploadResponse, VideoUploadResponse } from "@/src/api/types";

// ============================================
// Types
// ============================================

export type MediaType = "image" | "video";

export interface GetUploadUrlParams {
  type: MediaType;
}

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
const IMAGE_UPLOAD_TIMEOUT_MS = 60_000;
const VIDEO_UPLOAD_TIMEOUT_MS = 300_000;
const IMAGE_UPLOAD_MAX_WIDTH = 3840;
const IMAGE_UPLOAD_MAX_HEIGHT = 2160;
const IMAGE_UPLOAD_QUALITY = 0.92;

// ============================================
// Helpers
// ============================================

function getFileNameFromUri(localUri: string): string {
  return localUri.split("/").pop() || "unknown";
}

function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("Network") ||
    msg.includes("network") ||
    msg.includes("Upload aborted") ||
    msg.includes("timed out") ||
    msg.includes("no result") ||
    (error as any)?.code === "ERR_NETWORK";
}

function captureMediaUploadException(
  error: unknown,
  mediaType: MediaType,
  stage: string,
  localUri: string,
  contentType: string,
  extra?: Record<string, unknown>
) {
  if (isNetworkError(error)) return;
  Sentry.captureException(error, {
    tags: {
      feature: "media-upload",
      media_type: mediaType,
      stage,
    },
    extra: {
      fileName: getFileNameFromUri(localUri),
      contentType,
      ...extra,
    },
  });
}

function getUploadErrorCode(responseText: string): string | undefined {
  try {
    const parsed = responseText ? JSON.parse(responseText) : undefined;
    if (!parsed || typeof parsed !== "object") return undefined;
    const error = parsed as { error?: unknown; error_code?: unknown; code?: unknown; message?: unknown };
    const code = error.error_code ?? error.code ?? error.error ?? error.message;
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
      fileName: getFileNameFromUri(localUri),
      durationMs: Date.now() - startedAt,
    });
    return { uri: compressedUri, contentType: "image/jpeg" };
  } catch (error) {
    console.warn("[MediaUpload] Image compression failed; uploading original", error);
    Sentry.addBreadcrumb({
      category: "media-upload",
      message: "Image compression failed; uploading original",
      level: "warning",
      data: {
        fileName: getFileNameFromUri(localUri),
        contentType,
        error: error instanceof Error ? error.message : String(error),
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
    fileName: getFileNameFromUri(localUri),
    durationMs: Date.now() - startedAt,
    duration,
    width,
    height,
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
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error("Upload aborted");
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "Upload aborted") throw error;
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
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
          data: { delay, error: msg },
        });
        await waitForForeground();
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ============================================
// Endpoints
// ============================================

export async function getUploadUrl(
  params: GetUploadUrlParams
): Promise<ImageUploadResponse | VideoUploadResponse> {
  return api.post<ImageUploadResponse | VideoUploadResponse>(
    "/get_upload_url",
    params
  );
}

export async function getImageUploadUrl(): Promise<ImageUploadResponse> {
  return api.post<ImageUploadResponse>("/get_upload_url", { type: "image" });
}

export async function getVideoUploadUrl(): Promise<VideoUploadResponse> {
  return api.post<VideoUploadResponse>("/get_upload_url", { type: "video" });
}

export async function uploadMedia(
  localUri: string,
  mediaType: MediaType,
  contentType: string,
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal,
  parameters: UploadMediaParameters = {},
): Promise<UploadMediaResponse> {
  const normalizedUri = normalizeFileUri(localUri);
  const filename = getFileNameFromUri(localUri) || (mediaType === "video" ? "video.mp4" : "image.jpg");
  const timeoutMs = mediaType === "video" ? VIDEO_UPLOAD_TIMEOUT_MS : IMAGE_UPLOAD_TIMEOUT_MS;
  const uploadUrl = apiClient.getApiUrl("/upload_media");

  const uploadFn = async (): Promise<UploadMediaResponse> => {
    const task = createUploadTask(
      uploadUrl,
      normalizedUri,
      {
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: contentType,
        parameters: { kind: mediaType, ...parameters },
        headers: {},
        sessionType: FileSystemSessionType.FOREGROUND,
        httpMethod: "POST",
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0 && onProgress) {
          const pct = Math.min(100, Math.round(
            (data.totalBytesSent / data.totalBytesExpectedToSend) * 100
          ));
          onProgress(pct);
        }
      }
    );

    const onAbort = () => {
      task.cancelAsync();
    };
    if (signal) {
      if (signal.aborted) throw new Error("Upload aborted");
      signal.addEventListener("abort", onAbort, { once: true });
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        task.cancelAsync();
        reject(new Error(`${mediaType === "video" ? "Video" : "Image"} upload timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        task.uploadAsync(),
        timeoutPromise,
      ]);
      if (!result) throw new Error("Upload returned no result");
      console.log("[MediaUpload] upload_media complete", {
        status: result.status,
        mediaType,
        fileName: filename,
      });
      if (result.status < 200 || result.status >= 300) {
        const errorCode = getUploadErrorCode(result.body);
        Sentry.addBreadcrumb({
          category: "media-upload",
          message: "upload_media rejected upload",
          level: "warning",
          data: {
            mediaType,
            fileName: filename,
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
          fileName: filename,
          status: result.status,
          parameterCount: Object.keys(parameters).length,
        },
      });
      return parseUploadMediaResponse(result.body);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }
  };

  return withRetry(uploadFn, {
    label: `${mediaType}-upload`,
    maxRetries: mediaType === "video" ? 0 : MAX_UPLOAD_RETRIES,
    signal,
  });
}

// ============================================
// Image Upload (expo-file-system with retry)
// ============================================

export async function uploadToSignedUrl(
  uploadUrl: string,
  localUri: string,
  contentType: string,
  signal?: AbortSignal
): Promise<FileSystemUploadResult> {
  console.log("[MediaUpload] Starting upload to signed URL");

  const normalizedUri = normalizeFileUri(localUri);

  const uploadFn = async (): Promise<FileSystemUploadResult> => {
    const task = createUploadTask(
      uploadUrl,
      normalizedUri,
      {
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: contentType,
        parameters: {},
        headers: {},
        sessionType: FileSystemSessionType.FOREGROUND,
        httpMethod: "POST",
      }
    );

    if (signal) {
      const onAbort = () => {
        task.cancelAsync();
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        task.cancelAsync();
        reject(new Error(`Image upload timed out after ${IMAGE_UPLOAD_TIMEOUT_MS / 1000}s`));
      }, IMAGE_UPLOAD_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        task.uploadAsync(),
        timeoutPromise,
      ]);
      if (!result) throw new Error("Upload returned no result");
      if (result.status < 200 || result.status >= 300) {
        throw Object.assign(
          new Error(`Upload failed: ${result.status}`),
          { status: result.status, responseText: result.body }
        );
      }
      console.log("[MediaUpload] Upload complete, status:", result.status);
      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  return withRetry(uploadFn, { label: "image-upload", signal });
}

export function getImageUrl(
  uploadResponse: ImageUploadResponse,
  variant: string = "public"
): string {
  return `https://imagedelivery.net/${uploadResponse.accountHash}/${uploadResponse.id}/${variant}`;
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
  contentType: string = "image/jpeg"
): Promise<UploadImageResult> {
  console.log("[MediaUpload] uploadImage called with:", { localUri, contentType });
  Sentry.addBreadcrumb({
    category: "media-upload",
    message: "Starting image upload",
    level: "info",
    data: {
      fileName: getFileNameFromUri(localUri),
      contentType,
    },
  });

  try {
    const preparedImage = await prepareImageForUpload(localUri, contentType);
    const uploadResponse = await uploadMedia(
      preparedImage.uri,
      "image",
      preparedImage.contentType,
    );
    console.log("[MediaUpload] File uploaded successfully");
    const accountHash = uploadResponse.accountHash ?? uploadResponse.account_hash;
    const assetId = uploadResponse.asset_id ?? uploadResponse.id;
    const finalUrl = uploadResponse.url ?? (accountHash && assetId
      ? getImageUrl({
          uploadURL: "",
          id: assetId,
          accountHash,
        })
      : "");
    if (!finalUrl) throw new Error("Upload service did not return an image URL.");
    console.log("[MediaUpload] Final URL:", finalUrl);

    return {
      url: finalUrl,
      id: assetId ?? finalUrl,
      accountHash: uploadResponse.accountHash ?? uploadResponse.account_hash ?? "",
    };
  } catch (error) {
    console.error("[MediaUpload] Failed to upload file:", error);
    captureMediaUploadException(error, "image", "upload-file", localUri, contentType, {
      status: (error as { status?: number }).status,
      responseText: (error as { responseText?: string }).responseText,
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
  (progress: number): void;
}

export interface UploadVideoResult {
  url: string;
  uid: string;
  streamCustomer: string;
  thumbnailUrl: string;
  downloadUrl?: string;
  posterUrl?: string;
}

export function getVideoUrl(uploadResponse: VideoUploadResponse): string {
  if (!uploadResponse.streamCustomer) {
    return `https://videodelivery.net/${uploadResponse.uid}/manifest/video.m3u8`;
  }
  return `https://customer-${uploadResponse.streamCustomer}.cloudflarestream.com/${uploadResponse.uid}/manifest/video.m3u8`;
}

export function getVideoThumbnailUrl(uploadResponse: VideoUploadResponse): string {
  if (!uploadResponse.streamCustomer) {
    return `https://videodelivery.net/${uploadResponse.uid}/thumbnails/thumbnail.jpg`;
  }
  return `https://customer-${uploadResponse.streamCustomer}.cloudflarestream.com/${uploadResponse.uid}/thumbnails/thumbnail.jpg`;
}

export async function uploadVideoToSignedUrl(
  uploadUrl: string,
  localUri: string,
  contentType: string,
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal
): Promise<void> {
  const signedUploadStartedAt = Date.now();
  console.log("[VideoUpload] Starting upload to signed URL");

  const normalizedUri = normalizeFileUri(localUri);
  const filename = getFileNameFromUri(localUri) || "video.mp4";

  const uploadWithXhr = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let didSettle = false;

      const settle = (fn: () => void) => {
        if (didSettle) return;
        didSettle = true;
        signal?.removeEventListener("abort", onAbort);
        fn();
      };

      const onAbort = () => {
        xhr.abort();
        settle(() => reject(new Error("Upload aborted")));
      };

      xhr.open("POST", uploadUrl);
      xhr.timeout = VIDEO_UPLOAD_TIMEOUT_MS;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0 && onProgress) {
          const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
          onProgress(pct);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const durationMs = Date.now() - signedUploadStartedAt;
          console.log("[VideoUpload] Android XHR upload complete, status:", xhr.status);
          console.log("[VideoTiming] signed upload complete", {
            fileName: filename,
            platform: Platform.OS,
            status: xhr.status,
            durationMs,
          });
          Sentry.addBreadcrumb({
            category: "media-upload",
            message: "Video signed upload complete",
            level: "info",
            data: {
              fileName: filename,
              platform: Platform.OS,
              status: xhr.status,
              durationMs,
            },
          });
          settle(resolve);
          return;
        }
        settle(() => reject(Object.assign(
          new Error(`Upload failed: ${xhr.status}`),
          { status: xhr.status, responseText: xhr.responseText }
        )));
      };
      xhr.onerror = () => {
        settle(() => reject(new Error("Video upload network error")));
      };
      xhr.ontimeout = () => {
        settle(() => reject(new Error(`Video upload timed out after ${VIDEO_UPLOAD_TIMEOUT_MS / 1000}s`)));
      };
      xhr.onabort = () => {
        settle(() => reject(new Error("Upload aborted")));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const formData = new FormData();
      formData.append("file", {
        uri: normalizedUri,
        name: filename,
        type: contentType,
      } as unknown as Blob);
      Sentry.addBreadcrumb({
        category: "media-upload",
        message: "Using Android XHR video upload",
        level: "info",
        data: { fileName: filename, contentType },
      });
      xhr.send(formData);
    });
  };

  const uploadFn = async (): Promise<void> => {
    if (Platform.OS === "android") {
      await uploadWithXhr();
      return;
    }

    const task = createUploadTask(
      uploadUrl,
      normalizedUri,
      {
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: contentType,
        parameters: {},
        headers: {},
        sessionType: FileSystemSessionType.FOREGROUND,
        httpMethod: "POST",
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0 && onProgress) {
          const pct = Math.min(100, Math.round(
            (data.totalBytesSent / data.totalBytesExpectedToSend) * 100
          ));
          onProgress(pct);
        }
      }
    );

    if (signal) {
      const onAbort = () => {
        task.cancelAsync();
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        task.cancelAsync();
        reject(new Error(`Video upload timed out after ${VIDEO_UPLOAD_TIMEOUT_MS / 1000}s`));
      }, VIDEO_UPLOAD_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([
        task.uploadAsync(),
        timeoutPromise,
      ]);
      if (!result) throw new Error("Upload returned no result");
      if (result.status < 200 || result.status >= 300) {
        throw Object.assign(
          new Error(`Upload failed: ${result.status}`),
          { status: result.status, responseText: result.body }
        );
      }
      const durationMs = Date.now() - signedUploadStartedAt;
      console.log("[VideoUpload] Upload complete, status:", result.status);
      console.log("[VideoTiming] signed upload complete", {
        fileName: filename,
        platform: Platform.OS,
        status: result.status,
        durationMs,
      });
      Sentry.addBreadcrumb({
        category: "media-upload",
        message: "Video signed upload complete",
        level: "info",
        data: {
          fileName: filename,
          platform: Platform.OS,
          status: result.status,
          durationMs,
        },
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  // Cloudflare Stream signed upload URLs are single-use. If the client times
  // out after Cloudflare already accepted the file, retrying this same URL can
  // fail later with "Video already uploaded" and surface stale errors.
  return withRetry(uploadFn, { label: "video-upload", maxRetries: 0, signal });
}

export async function uploadVideo(
  localUri: string,
  contentType: string = "video/mp4",
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal
): Promise<UploadVideoResult> {
  const uploadStartedAt = Date.now();
  const fileName = getFileNameFromUri(localUri);
  console.log("[VideoUpload] uploadVideo called with:", { localUri, contentType });
  console.log("[VideoTiming] upload start", {
    fileName,
    contentType,
    platform: Platform.OS,
  });
  Sentry.addBreadcrumb({
    category: "media-upload",
    message: "Starting video upload",
    level: "info",
    data: {
      fileName,
      contentType,
    },
  });

  try {
    const uploadUrlStartedAt = Date.now();
    const videoParameters = await getVideoUploadParameters(localUri);
    const uploadResponse = await uploadMedia(
      localUri,
      "video",
      contentType,
      onProgress,
      signal,
      videoParameters,
    );
    const uploadUrlDurationMs = Date.now() - uploadUrlStartedAt;
    console.log("[VideoTiming] upload URL ready", {
      fileName,
      durationMs: uploadUrlDurationMs,
      totalDurationMs: Date.now() - uploadStartedAt,
      uid: uploadResponse.uid,
    });
    Sentry.addBreadcrumb({
      category: "media-upload",
      message: "Video upload URL ready",
      level: "info",
      data: {
        fileName,
        durationMs: uploadUrlDurationMs,
        totalDurationMs: Date.now() - uploadStartedAt,
        uid: uploadResponse.uid,
        provider: "upload_media",
      },
    });
    console.log("[VideoUpload] Got upload response:", JSON.stringify(uploadResponse, null, 2));
    console.log("[VideoUpload] File uploaded successfully");

    const streamCustomer = uploadResponse.streamCustomer ?? uploadResponse.stream_customer ?? "";
    const assetId = uploadResponse.asset_id ?? uploadResponse.uid;
    const normalizedVideoResponse: VideoUploadResponse = {
      uploadURL: "",
      provider: "stream",
      streamCustomer,
      stream_customer: streamCustomer,
      uid: assetId ?? "",
      url: uploadResponse.url,
      thumbnailUrl: uploadResponse.thumbnailUrl,
      thumbnail_url: uploadResponse.thumbnail_url,
    };
    const finalUrl = uploadResponse.url ?? getVideoUrl(normalizedVideoResponse);
    const thumbnailUrl =
      uploadResponse.thumbnailUrl ??
      uploadResponse.thumbnail_url ??
      uploadResponse.posterUrl ??
      uploadResponse.poster_url ??
      getVideoThumbnailUrl(normalizedVideoResponse);
    console.log("[VideoUpload] Final URL:", finalUrl);
    const totalUploadDurationMs = Date.now() - uploadStartedAt;
    console.log("[VideoTiming] upload complete", {
      fileName,
      uid: assetId,
      totalDurationMs: totalUploadDurationMs,
      finalUrl,
    });
    Sentry.addBreadcrumb({
      category: "media-upload",
      message: "Video upload complete",
      level: "info",
      data: {
        fileName,
        uid: assetId,
        totalDurationMs: totalUploadDurationMs,
        finalUrl,
      },
    });
    if (totalUploadDurationMs > 30000) {
      Sentry.captureMessage("Video upload was slow", {
        level: "warning",
        tags: {
          feature: "video-posting",
          operation: "video-upload",
        },
        extra: {
          fileName,
          uid: assetId,
          totalDurationMs: totalUploadDurationMs,
          finalUrl,
        },
      });
    }

    return {
      url: finalUrl,
      uid: assetId ?? finalUrl,
      streamCustomer,
      thumbnailUrl,
      downloadUrl: uploadResponse.downloadUrl ?? uploadResponse.download_url,
      posterUrl: uploadResponse.posterUrl ?? uploadResponse.poster_url ?? thumbnailUrl,
    };
  } catch (error) {
    console.error("[VideoUpload] Failed to upload file:", error);
    captureMediaUploadException(error, "video", "upload-file", localUri, contentType, {
      status: (error as { status?: number }).status,
      responseText: (error as { responseText?: string }).responseText,
    });
    throw error;
  }
}

export function isVideoFile(uri: string): boolean {
  const contentType = getContentTypeFromUri(uri);
  return contentType.startsWith("video/");
}
