/**
 * Media Upload Endpoints
 *
 * POST /get_upload_url - Get a signed URL for uploading media
 */

import { api } from "@/src/api/client";
import * as Sentry from "@sentry/react-native";
import {
  createUploadTask,
  uploadAsync,
  FileSystemUploadType,
  FileSystemSessionType,
} from "expo-file-system/legacy";
import type {
  FileSystemUploadResult,
  UploadProgressData,
  FileSystemNetworkTaskProgressCallback,
} from "expo-file-system/legacy";
import * as Network from "expo-network";
import { AppState } from "react-native";
import type { ImageUploadResponse, VideoUploadResponse } from "@/src/api/types";

// ============================================
// Types
// ============================================

export type MediaType = "image" | "video";

export interface GetUploadUrlParams {
  type: MediaType;
}

// ============================================
// Constants
// ============================================

const MAX_UPLOAD_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const IMAGE_UPLOAD_TIMEOUT_MS = 60_000;
const VIDEO_UPLOAD_TIMEOUT_MS = 300_000;

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

async function waitForNetwork(): Promise<void> {
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected && state.isInternetReachable !== false) return;
  console.log("[MediaUpload] Network unavailable, waiting for reconnection...");
  return new Promise((resolve) => {
    const sub = Network.addNetworkStateListener((event) => {
      if (event.isConnected && event.isInternetReachable !== false) {
        sub.remove();
        console.log("[MediaUpload] Network restored, resuming upload");
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
      if (status === 422) throw error;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[MediaUpload] ${label} retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
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
  const filename = getFileNameFromUri(localUri) || "image.jpg";

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

  let uploadResponse: ImageUploadResponse;
  try {
    uploadResponse = await getImageUploadUrl();
    console.log("[MediaUpload] Got upload response:", uploadResponse);
  } catch (error) {
    console.error("[MediaUpload] Failed to get upload URL:", error);
    captureMediaUploadException(error, "image", "get-upload-url", localUri, contentType);
    throw error;
  }

  try {
    await uploadToSignedUrl(uploadResponse.uploadURL, localUri, contentType);
    console.log("[MediaUpload] File uploaded successfully");
  } catch (error) {
    console.error("[MediaUpload] Failed to upload file:", error);
    captureMediaUploadException(error, "image", "upload-file", localUri, contentType, {
      status: (error as { status?: number }).status,
      responseText: (error as { responseText?: string }).responseText,
    });
    throw error;
  }

  const finalUrl = getImageUrl(uploadResponse);
  console.log("[MediaUpload] Final URL:", finalUrl);

  return {
    url: finalUrl,
    id: uploadResponse.id,
    accountHash: uploadResponse.accountHash,
  };
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
  console.log("[VideoUpload] Starting upload to signed URL");

  const normalizedUri = normalizeFileUri(localUri);

  const uploadFn = async (): Promise<void> => {
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
      console.log("[VideoUpload] Upload complete, status:", result.status);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  return withRetry(uploadFn, { label: "video-upload", signal });
}

export async function uploadVideo(
  localUri: string,
  contentType: string = "video/mp4",
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal
): Promise<UploadVideoResult> {
  console.log("[VideoUpload] uploadVideo called with:", { localUri, contentType });
  Sentry.addBreadcrumb({
    category: "media-upload",
    message: "Starting video upload",
    level: "info",
    data: {
      fileName: getFileNameFromUri(localUri),
      contentType,
    },
  });

  let uploadResponse: VideoUploadResponse;
  try {
    uploadResponse = await getVideoUploadUrl();
    console.log("[VideoUpload] Got upload response:", JSON.stringify(uploadResponse, null, 2));

    if (!uploadResponse.streamCustomer && uploadResponse.stream_customer) {
      uploadResponse.streamCustomer = uploadResponse.stream_customer;
    }

    if (!uploadResponse.streamCustomer) {
      console.warn("[VideoUpload] Missing streamCustomer, using videodelivery.net fallback");
    }
  } catch (error) {
    console.error("[VideoUpload] Failed to get upload URL:", error);
    captureMediaUploadException(error, "video", "get-upload-url", localUri, contentType);
    throw error;
  }

  try {
    await uploadVideoToSignedUrl(
      uploadResponse.uploadURL,
      localUri,
      contentType,
      onProgress,
      signal
    );
    console.log("[VideoUpload] File uploaded successfully");
  } catch (error) {
    console.error("[VideoUpload] Failed to upload file:", error);
    captureMediaUploadException(error, "video", "upload-file", localUri, contentType, {
      status: (error as { status?: number }).status,
      responseText: (error as { responseText?: string }).responseText,
    });
    throw error;
  }

  const finalUrl = getVideoUrl(uploadResponse);
  const thumbnailUrl = getVideoThumbnailUrl(uploadResponse);
  console.log("[VideoUpload] Final URL:", finalUrl);

  return {
    url: finalUrl,
    uid: uploadResponse.uid,
    streamCustomer: uploadResponse.streamCustomer,
    thumbnailUrl,
  };
}

export function isVideoFile(uri: string): boolean {
  const contentType = getContentTypeFromUri(uri);
  return contentType.startsWith("video/");
}
