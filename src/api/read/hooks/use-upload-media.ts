/**
 * Media Upload Hook
 *
 * Provides mutation hooks for uploading images and videos with progress tracking.
 */

import { useCallback, useRef, useState } from "react";
import * as Sentry from "@sentry/react-native";
import { useMutation } from "@tanstack/react-query";
import {
  uploadImage,
  uploadVideo,
  getContentTypeFromUri,
  isVideoFile,
  type UploadImageResult,
  type UploadVideoResult,
  type UploadProgressCallback,
} from "../endpoints/media";

// ============================================
// Types
// ============================================

export interface UploadMediaInput {
  /** Local file URI from image picker */
  uri: string;
  /** Optional content type override */
  contentType?: string;
}

export interface UseUploadMediaOptions {
  /** Callback when upload succeeds */
  onSuccess?: (result: UploadImageResult) => void;
  /** Callback when upload fails */
  onError?: (error: Error) => void;
}

export interface UploadVideoInput {
  uri: string;
  contentType?: string;
}

export interface UseUploadVideoOptions {
  onSuccess?: (result: UploadVideoResult) => void;
  onError?: (error: Error) => void;
  onProgress?: UploadProgressCallback;
}

export interface VideoUploadState {
  isUploading: boolean;
  progress: number;
  error: Error | null;
  result: UploadVideoResult | null;
}

// ============================================
// Hooks
// ============================================

/**
 * Hook for uploading images
 */
export function useUploadMedia(options: UseUploadMediaOptions = {}) {
  return useMutation({
    mutationFn: async (input: UploadMediaInput) => {
      const contentType =
        input.contentType ?? getContentTypeFromUri(input.uri);
      return uploadImage(input.uri, contentType);
    },
    onSuccess: options.onSuccess,
    onError: options.onError,
  });
}

/**
 * Hook for uploading videos with progress tracking
 *
 * @example
 * ```tsx
 * const {
 *   uploadVideo,
 *   isUploading,
 *   progress,
 *   cancelUpload,
 *   reset
 * } = useUploadVideo({
 *   onSuccess: (result) => console.log('Video URL:', result.url),
 *   onProgress: (pct) => console.log('Progress:', pct),
 * });
 *
 * // Upload a video
 * await uploadVideo({ uri: videoUri });
 * ```
 */
export function useUploadVideo(options: UseUploadVideoOptions = {}) {
  const [state, setState] = useState<VideoUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    result: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleProgress: UploadProgressCallback = useCallback(
    (progress: number) => {
      const clampedProgress = Math.min(100, Math.max(0, progress));
      setState((prev) => ({ ...prev, progress: clampedProgress }));
      options.onProgress?.(clampedProgress);
    },
    [options.onProgress]
  );

  const uploadVideoFn = useCallback(
    async (input: UploadVideoInput): Promise<UploadVideoResult> => {
      setState({
        isUploading: true,
        progress: 0,
        error: null,
        result: null,
      });

      abortControllerRef.current = new AbortController();

      try {
        const contentType =
          input.contentType ?? getContentTypeFromUri(input.uri);

        const result = await uploadVideo(
          input.uri,
          contentType,
          handleProgress,
          abortControllerRef.current.signal
        );

        setState((prev) => ({
          ...prev,
          isUploading: false,
          progress: 100,
          result,
        }));

        options.onSuccess?.(result);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Upload failed");
        Sentry.captureException(err, { tags: { feature: "media-upload", hook: "useUploadMedia" } });
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error: err,
        }));
        options.onError?.(err);
        throw err;
      }
    },
    [handleProgress, options]
  );

  const cancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      result: null,
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      result: null,
    });
  }, []);

  return {
    uploadVideo: uploadVideoFn,
    isUploading: state.isUploading,
    progress: state.progress,
    error: state.error,
    result: state.result,
    cancelUpload,
    reset,
  };
}

// ============================================
// Standalone Functions
// ============================================

/**
 * Upload an image and return the URL
 *
 * Standalone function for use outside of React components.
 *
 * @param uri - Local file URI
 * @returns The uploaded image URL
 */
export async function uploadImageAndGetUrl(uri: string): Promise<string> {
  const contentType = getContentTypeFromUri(uri);
  const result = await uploadImage(uri, contentType);
  return result.url;
}

/**
 * Upload a video and return the URL
 *
 * Standalone function for use outside of React components.
 *
 * @param uri - Local file URI
 * @param onProgress - Optional progress callback
 * @returns The uploaded video URL
 */
export async function uploadVideoAndGetUrl(
  uri: string,
  onProgress?: UploadProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  const contentType = getContentTypeFromUri(uri);
  const result = await uploadVideo(uri, contentType, onProgress, signal);
  return result.url;
}

export { isVideoFile };
