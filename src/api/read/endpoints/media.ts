/**
 * Media Upload Endpoints
 *
 * POST /get_upload_url - Get a signed URL for uploading media
 */

import { api } from "@/src/api/client";
import * as Sentry from "@sentry/react-native";
import type { ImageUploadResponse, VideoUploadResponse } from "@/src/api/types";

// ============================================
// Types
// ============================================

export type MediaType = "image" | "video";

export interface GetUploadUrlParams {
  type: MediaType;
}

function getFileNameFromUri(localUri: string): string {
  return localUri.split("/").pop() || "unknown";
}

function captureMediaUploadException(
  error: unknown,
  mediaType: MediaType,
  stage: string,
  localUri: string,
  contentType: string,
  extra?: Record<string, unknown>
) {
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

// ============================================
// Endpoints
// ============================================

/**
 * Get a signed upload URL for media
 *
 * @param type - "image" or "video"
 * @returns Upload URL and metadata for the upload
 */
export async function getUploadUrl(
  params: GetUploadUrlParams
): Promise<ImageUploadResponse | VideoUploadResponse> {
  return api.post<ImageUploadResponse | VideoUploadResponse>(
    "/get_upload_url",
    params
  );
}

/**
 * Get upload URL specifically for images
 */
export async function getImageUploadUrl(): Promise<ImageUploadResponse> {
  return api.post<ImageUploadResponse>("/get_upload_url", { type: "image" });
}

/**
 * Get upload URL specifically for videos
 */
export async function getVideoUploadUrl(): Promise<VideoUploadResponse> {
  return api.post<VideoUploadResponse>("/get_upload_url", { type: "video" });
}

// ============================================
// Upload Functions
// ============================================

/**
 * Upload a file to the Cloudflare Images signed URL
 *
 * Cloudflare Images direct upload expects FormData with a "file" field.
 *
 * @param uploadUrl - The signed URL from getUploadUrl
 * @param localUri - Local file URI (e.g., from expo-image-picker)
 * @param contentType - MIME type of the file
 * @returns The response from Cloudflare
 */
export async function uploadToSignedUrl(
  uploadUrl: string,
  localUri: string,
  contentType: string
): Promise<Response> {
  console.log("[MediaUpload] Starting upload to signed URL");
  console.log("[MediaUpload] Upload URL:", uploadUrl);
  console.log("[MediaUpload] Local URI:", localUri);
  console.log("[MediaUpload] Content Type:", contentType);

  // Create FormData with the file
  // React Native's fetch handles file:// URIs specially when wrapped in FormData
  const formData = new FormData();
  
  // Extract filename from URI
  const filename = getFileNameFromUri(localUri) || "image.jpg";
  
  // Append the file - React Native handles file:// URIs
  // @ts-expect-error - React Native FormData accepts this format
  formData.append("file", {
    uri: localUri,
    type: contentType,
    name: filename,
  });

  console.log("[MediaUpload] FormData created with filename:", filename);

  // Upload to the signed URL
  // Note: Don't set Content-Type header - fetch will set it with boundary for FormData
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  console.log("[MediaUpload] Response status:", response.status);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    console.error("[MediaUpload] Upload failed:", response.status, errorText);
    throw Object.assign(
      new Error(`Upload failed: ${response.status} ${response.statusText}`),
      {
        status: response.status,
        responseText: errorText,
      }
    );
  }

  const result = await response.json().catch(() => ({}));
  console.log("[MediaUpload] Upload result:", result);

  return response;
}

/**
 * Construct the final image URL from upload response
 *
 * Cloudflare Images URL format:
 * https://imagedelivery.net/{accountHash}/{id}/{variant}
 *
 * @param uploadResponse - The response from getImageUploadUrl
 * @param variant - The image variant (default: "public")
 * @returns The final accessible image URL
 */
export function getImageUrl(
  uploadResponse: ImageUploadResponse,
  variant: string = "public"
): string {
  return `https://imagedelivery.net/${uploadResponse.accountHash}/${uploadResponse.id}/${variant}`;
}

// ============================================
// High-level Upload Function
// ============================================

export interface UploadImageResult {
  /** The final accessible URL for the uploaded image */
  url: string;
  /** The image ID from Cloudflare */
  id: string;
  /** The account hash */
  accountHash: string;
}

/**
 * Upload an image and get the final URL
 *
 * This is the main function to use for uploading images.
 * It handles getting the upload URL, uploading the file, and returning the final URL.
 *
 * @param localUri - Local file URI (e.g., from expo-image-picker)
 * @param contentType - MIME type (defaults to "image/jpeg")
 * @returns The final image URL and metadata
 */
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

  // 1. Get the signed upload URL
  console.log("[MediaUpload] Getting upload URL from API...");
  let uploadResponse: ImageUploadResponse;
  try {
    uploadResponse = await getImageUploadUrl();
    console.log("[MediaUpload] Got upload response:", uploadResponse);
  } catch (error) {
    console.error("[MediaUpload] Failed to get upload URL:", error);
    captureMediaUploadException(error, "image", "get-upload-url", localUri, contentType);
    throw error;
  }

  // 2. Upload the file
  console.log("[MediaUpload] Uploading file to Cloudflare...");
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

  // 3. Return the final URL
  const finalUrl = getImageUrl(uploadResponse);
  console.log("[MediaUpload] Final URL:", finalUrl);
  
  return {
    url: finalUrl,
    id: uploadResponse.id,
    accountHash: uploadResponse.accountHash,
  };
}

/**
 * Determine content type from file URI
 */
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
}

export function getVideoUrl(uploadResponse: VideoUploadResponse): string {
  // Use videodelivery.net as fallback when streamCustomer is empty
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
  onProgress?: UploadProgressCallback
): Promise<void> {
  console.log("[VideoUpload] Starting upload to signed URL");
  console.log("[VideoUpload] Upload URL:", uploadUrl);
  console.log("[VideoUpload] Local URI:", localUri);

  // Ensure the URI has the file:// prefix for Android
  let normalizedUri = localUri;
  if (!localUri.startsWith("file://") && !localUri.startsWith("content://") && !localUri.startsWith("http")) {
    normalizedUri = `file://${localUri}`;
    console.log("[VideoUpload] Normalized URI:", normalizedUri);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = Math.min(100, Math.round((event.loaded / event.total) * 100));
        console.log(`[VideoUpload] Progress: ${progress}%`);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log("[VideoUpload] Upload complete, status:", xhr.status);
        resolve();
      } else {
        console.error("[VideoUpload] Upload failed:", xhr.status, xhr.responseText);
        reject(
          Object.assign(new Error(`Upload failed: ${xhr.status}`), {
            status: xhr.status,
            responseText: xhr.responseText,
          })
        );
      }
    });

    xhr.addEventListener("error", () => {
      console.error("[VideoUpload] Network error");
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("abort", () => {
      console.log("[VideoUpload] Upload aborted");
      reject(new Error("Upload aborted"));
    });

    xhr.open("POST", uploadUrl);

    const formData = new FormData();
    const filename = normalizedUri.split("/").pop() || "video.mp4";

    // @ts-expect-error - React Native FormData accepts this format
    formData.append("file", {
      uri: normalizedUri,
      type: contentType,
      name: filename,
    });

    xhr.send(formData);
  });
}

export async function uploadVideo(
  localUri: string,
  contentType: string = "video/mp4",
  onProgress?: UploadProgressCallback
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

  console.log("[VideoUpload] Getting upload URL from API...");
  let uploadResponse: VideoUploadResponse;
  try {
    uploadResponse = await getVideoUploadUrl();
    console.log("[VideoUpload] Got upload response:", JSON.stringify(uploadResponse, null, 2));
    
    // Handle snake_case field name from API (stream_customer -> streamCustomer)
    if (!uploadResponse.streamCustomer && uploadResponse.stream_customer) {
      uploadResponse.streamCustomer = uploadResponse.stream_customer;
    }
    
    // Validate required fields
    if (!uploadResponse.streamCustomer) {
      console.warn("[VideoUpload] Missing streamCustomer, using videodelivery.net fallback");
    }
  } catch (error) {
    console.error("[VideoUpload] Failed to get upload URL:", error);
    captureMediaUploadException(error, "video", "get-upload-url", localUri, contentType);
    throw error;
  }

  console.log("[VideoUpload] Uploading file to Cloudflare Stream...");
  try {
    await uploadVideoToSignedUrl(
      uploadResponse.uploadURL,
      localUri,
      contentType,
      onProgress
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
  console.log("[VideoUpload] Final URL:", finalUrl);

  return {
    url: finalUrl,
    uid: uploadResponse.uid,
    streamCustomer: uploadResponse.streamCustomer,
  };
}

export function isVideoFile(uri: string): boolean {
  const contentType = getContentTypeFromUri(uri);
  return contentType.startsWith("video/");
}
