/**
 * Media Upload Hook
 *
 * Provides a mutation hook for uploading images with progress tracking.
 */

import { useMutation } from "@tanstack/react-query";
import {
  uploadImage,
  getContentTypeFromUri,
  type UploadImageResult,
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

// ============================================
// Hook
// ============================================

/**
 * Hook for uploading images
 *
 * @example
 * ```tsx
 * const uploadMutation = useUploadMedia({
 *   onSuccess: (result) => {
 *     console.log('Uploaded image URL:', result.url);
 *   },
 * });
 *
 * // Upload an image
 * const handleUpload = async (imageUri: string) => {
 *   const result = await uploadMutation.mutateAsync({ uri: imageUri });
 *   return result.url;
 * };
 * ```
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

