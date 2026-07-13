import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/react-native";

import {
  uploadImageAndGetUrl,
  uploadVideoAndGetUrl,
} from "@/src/api/read/hooks/use-upload-media";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import { useDraftStore } from "@/src/stores/draft-store";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";
import { IMAGE_UPLOADS, VIDEO_UPLOADS } from "./create-upload-state";
import { useUploadNetworkRetry } from "./use-upload-network-retry";

export type CreateVideoUploadState = Record<
  string,
  { progress: number; uploading: boolean; done: boolean; error: string | null }
>;

export type CreateImageUploadState = Record<
  string,
  { uploading: boolean; done: boolean; error: string | null }
>;

export function useCreateMediaUploads() {
  const toast = useToast();
  const draft = useDraftStore((state) => state.draft);
  const [videoUploadState, setVideoUploadState] = useState<CreateVideoUploadState>(() => {
    const init: CreateVideoUploadState = {};
    for (const [uri, entry] of VIDEO_UPLOADS) {
      init[uri] = {
        progress: entry.progress,
        uploading: entry.uploading,
        done: !!entry.url,
        error: entry.error,
      };
    }
    return init;
  });
  const videoUploadStateRef = useRef(setVideoUploadState);
  videoUploadStateRef.current = setVideoUploadState;

  const [imageUploadState, setImageUploadState] = useState<CreateImageUploadState>(() => {
    const init: CreateImageUploadState = {};
    for (const [uri, entry] of IMAGE_UPLOADS) {
      init[uri] = {
        uploading: entry.uploading,
        done: !!entry.url,
        error: entry.error,
      };
    }
    return init;
  });
  const imageUploadStateRef = useRef(setImageUploadState);
  imageUploadStateRef.current = setImageUploadState;

  const videoUploadSessionRef = useRef(0);
  const videoUploadControllersRef = useRef(new Map<string, AbortController>());
  const imageUploadToastShownRef = useRef(false);
  const videoUploadToastShownRef = useRef(false);
  const videoUploadDraftDebugRef = useRef({
    attachmentType: draft.attachmentType,
    mediaUris: draft.mediaUris,
  });
  videoUploadDraftDebugRef.current = {
    attachmentType: draft.attachmentType,
    mediaUris: draft.mediaUris,
  };

  const isUploadingVideo = useMemo(() => {
    return Object.values(videoUploadState).some((value) => value.uploading);
  }, [videoUploadState]);

  const failedVideoUploads = useMemo(() => {
    return Object.entries(videoUploadState)
      .filter(([, value]) => value.error)
      .map(([uri, value]) => ({ uri, error: value.error! }));
  }, [videoUploadState]);

  const hasFailedUploads = failedVideoUploads.length > 0;

  const failedImageUploads = useMemo(() => {
    return Object.entries(imageUploadState)
      .filter(([, value]) => value.error)
      .map(([uri, value]) => ({ uri, error: value.error! }));
  }, [imageUploadState]);

  const hasFailedImageUploads = failedImageUploads.length > 0;

  const isUploadingImage = useMemo(() => {
    return Object.values(imageUploadState).some((value) => value.uploading);
  }, [imageUploadState]);

  const imageUploadsReady = useMemo(() => {
    if (draft.attachmentType !== "image") return true;
    if (draft.mediaUris.length === 0) return true;
    return draft.mediaUris.every((uri) => {
      const entry = IMAGE_UPLOADS.get(uri);
      return !!entry && !!entry.url && !entry.uploading && !entry.error;
    });
  }, [draft.attachmentType, draft.mediaUris, imageUploadState]);

  const videoUploadsReady = useMemo(() => {
    if (draft.attachmentType !== "video") return true;
    if (draft.mediaUris.length === 0) return true;
    return draft.mediaUris.every((uri) => {
      const entry = VIDEO_UPLOADS.get(uri);
      return !!entry && !!entry.url && !entry.uploading && !entry.error;
    });
  }, [draft.attachmentType, draft.mediaUris, videoUploadState]);

  const startImageUpload = useCallback((uri: string, silent = false) => {
    const existing = IMAGE_UPLOADS.get(uri);
    if (existing?.uploading || existing?.url) {
      Sentry.addBreadcrumb({
        category: "image-upload",
        message: existing.uploading ? "Reusing in-flight image upload" : "Using completed image upload",
        level: "info",
        data: {
          fileName: uri.split("/").pop() ?? uri,
          hasUrl: !!existing.url,
          silent,
        },
      });
      return existing.promise;
    }

    Sentry.addBreadcrumb({
      category: "image-upload",
      message: "Starting create image upload",
      level: "info",
      data: {
        fileName: uri.split("/").pop() ?? uri,
        silent,
        isCurrentDraftMedia: draft.mediaUris.includes(uri),
        attachmentType: draft.attachmentType,
      },
    });

    const promise = uploadImageAndGetUrl(uri)
      .then((url) => {
        Sentry.addBreadcrumb({
          category: "image-upload",
          message: "Create image upload succeeded",
          level: "info",
          data: {
            fileName: uri.split("/").pop() ?? uri,
            hasUrl: !!url,
          },
        });
        IMAGE_UPLOADS.set(uri, { url, uploading: false, error: null });
        imageUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { uploading: false, done: true, error: null },
        }));
        imageUploadToastShownRef.current = false;
        return url;
      })
      .catch((error) => {
        const status = (error as any)?.response?.status ?? (error as any)?.status;
        const responseText = (error as any)?.responseText ?? (error as any)?.response?.data?.error ?? "";
        const isUnsupportedFormat = status === 422 && String(responseText).includes("decoding");
        const msg = isUnsupportedFormat
          ? "This image format isn't supported. Try a different photo."
          : error instanceof Error ? error.message : "Upload failed";
        const isServerError = !!status && status >= 400;
        Sentry.captureException(error, {
          tags: {
            feature: "create-post",
            operation: "image-upload",
            serverError: String(isServerError),
            unsupportedFormat: String(isUnsupportedFormat),
          },
          extra: {
            fileName: uri.split("/").pop() ?? uri,
            status,
            responseText,
            silent,
            isCurrentDraftMedia: draft.mediaUris.includes(uri),
            attachmentType: draft.attachmentType,
          },
        });
        IMAGE_UPLOADS.set(uri, { url: null, uploading: false, error: msg, isServerError });
        imageUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { uploading: false, done: false, error: msg },
        }));
        if (!silent && !imageUploadToastShownRef.current) {
          imageUploadToastShownRef.current = true;
          toast.error("Image upload failed", msg);
        }
        throw error;
      });

    IMAGE_UPLOADS.set(uri, { url: null, uploading: true, error: null, isServerError: false, promise });
    imageUploadStateRef.current((prev) => ({
      ...prev,
      [uri]: { uploading: true, done: false, error: null },
    }));
    return promise;
  }, [draft.attachmentType, draft.mediaUris, toast]);

  const getUploadedImageUrls = useCallback(async (uris: string[]) => {
    const urls = await Promise.all(
      uris.map(async (uri) => {
        const entry = IMAGE_UPLOADS.get(uri);
        if (entry?.url) return entry.url;
        if (entry?.promise) return entry.promise;
        return startImageUpload(uri, true) ?? uploadImageAndGetUrl(uri);
      }),
    );
    return urls;
  }, [startImageUpload]);

  const resetImageUploads = useCallback(() => {
    if (IMAGE_UPLOADS.size > 0) {
      Sentry.addBreadcrumb({
        category: "image-upload",
        message: "Resetting image uploads",
        level: "info",
        data: {
          trackedUploadCount: IMAGE_UPLOADS.size,
        },
      });
    }
    IMAGE_UPLOADS.clear();
    setImageUploadState({});
  }, []);

  const getVideoUploadDebugData = useCallback((uri: string, sessionId?: number) => ({
    fileName: uri.split("/").pop() ?? uri,
    sessionId,
    activeSessionId: videoUploadSessionRef.current,
    isCurrentDraftMedia: videoUploadDraftDebugRef.current.mediaUris.includes(uri),
    attachmentType: videoUploadDraftDebugRef.current.attachmentType,
  }), []);

  const resetVideoUploads = useCallback(() => {
    const nextSessionId = videoUploadSessionRef.current + 1;
    const activeUploadCount = videoUploadControllersRef.current.size;
    Sentry.addBreadcrumb({
      category: "video-upload",
      message: "Resetting video upload session",
      level: "info",
      data: {
        previousSessionId: videoUploadSessionRef.current,
        nextSessionId,
        activeUploadCount,
        trackedUploadCount: VIDEO_UPLOADS.size,
        attachmentType: videoUploadDraftDebugRef.current.attachmentType,
        mediaCount: videoUploadDraftDebugRef.current.mediaUris.length,
      },
    });
    videoUploadSessionRef.current += 1;
    for (const controller of videoUploadControllersRef.current.values()) {
      controller.abort();
    }
    videoUploadControllersRef.current.clear();
    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
    videoUploadToastShownRef.current = false;
  }, []);

  const startVideoUpload = useCallback((uri: string, silent = false) => {
    const sessionId = videoUploadSessionRef.current;
    if (videoUploadControllersRef.current.has(uri)) {
      Sentry.addBreadcrumb({
        category: "video-upload",
        message: "Aborting previous upload for same URI",
        level: "info",
        data: getVideoUploadDebugData(uri, sessionId),
      });
      videoUploadControllersRef.current.get(uri)?.abort();
    }
    const controller = new AbortController();
    videoUploadControllersRef.current.set(uri, controller);
    Sentry.addBreadcrumb({
      category: "video-upload",
      message: "Starting create video upload",
      level: "info",
      data: {
        ...getVideoUploadDebugData(uri, sessionId),
        silent,
      },
    });
    VIDEO_UPLOADS.set(uri, { url: null, uploading: true, progress: 0, error: null, sessionId });
    videoUploadStateRef.current((prev) => ({
      ...prev,
      [uri]: { progress: 0, uploading: true, done: false, error: null },
    }));
    uploadVideoAndGetUrl(uri, (progress) => {
      if (videoUploadSessionRef.current !== sessionId) {
        Sentry.addBreadcrumb({
          category: "video-upload",
          message: "Ignored stale video upload progress",
          level: "info",
          data: {
            ...getVideoUploadDebugData(uri, sessionId),
            progress,
          },
        });
        return;
      }
      const clamped = Math.min(100, Math.max(0, progress));
      const entry = VIDEO_UPLOADS.get(uri);
      if (entry?.sessionId === sessionId) {
        VIDEO_UPLOADS.set(uri, { ...entry, progress: clamped });
      }
      videoUploadStateRef.current((prev) => ({
        ...prev,
        [uri]: { ...prev[uri], progress: clamped },
      }));
    }, controller.signal)
      .then((url) => {
        if (videoUploadSessionRef.current !== sessionId || controller.signal.aborted) {
          Sentry.addBreadcrumb({
            category: "video-upload",
            message: "Ignored stale video upload completion",
            level: "info",
            data: {
              ...getVideoUploadDebugData(uri, sessionId),
              hasUrl: !!url,
            },
          });
          return;
        }
        videoUploadControllersRef.current.delete(uri);
        Sentry.addBreadcrumb({
          category: "video-upload",
          message: "Create video upload URL ready",
          level: "info",
          data: {
            ...getVideoUploadDebugData(uri, sessionId),
            hasUrl: !!url,
          },
        });
        VIDEO_UPLOADS.set(uri, { url, uploading: false, progress: 100, error: null, sessionId });
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { progress: 100, uploading: false, done: true, error: null },
        }));
        videoUploadToastShownRef.current = false;
        triggerHaptic("success");
      })
      .catch((err) => {
        if (videoUploadSessionRef.current !== sessionId || controller.signal.aborted) {
          Sentry.addBreadcrumb({
            category: "video-upload",
            message: controller.signal.aborted
              ? "Ignored aborted video upload failure"
              : "Ignored stale video upload failure",
            level: "info",
            data: {
              ...getVideoUploadDebugData(uri, sessionId),
              error: err instanceof Error ? err.message : String(err),
            },
          });
          return;
        }
        videoUploadControllersRef.current.delete(uri);
        const status = err?.response?.status ?? err?.status;
        const serverError = err?.response?.data?.error ?? err?.responseText;
        const msg = err?.response?.data?.error_code ? getApiErrorMessage(err) : (err instanceof Error ? err.message : "Upload failed");
        const isServerError = !!status && status >= 400;
        Sentry.addBreadcrumb({
          category: "video-upload",
          message: "Create video upload failed",
          data: {
            ...getVideoUploadDebugData(uri, sessionId),
            error: err instanceof Error ? err.message : String(err),
            status,
            responseText: err?.responseText,
            serverError,
            isServerError,
            silent,
          },
          level: "error",
        });
        Sentry.captureException(err, {
          tags: {
            feature: "create-post",
            operation: "video-upload",
            serverError: String(isServerError),
          },
          extra: {
            ...getVideoUploadDebugData(uri, sessionId),
            status,
            responseText: err?.responseText,
            serverError,
            cause: err?.cause instanceof Error ? err.cause.message : err?.cause ? String(err.cause) : undefined,
          },
        });
        VIDEO_UPLOADS.set(uri, { url: null, uploading: false, progress: 0, error: msg, isServerError, sessionId });
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { progress: 0, uploading: false, done: false, error: msg },
        }));
        if (!silent && !videoUploadToastShownRef.current) {
          videoUploadToastShownRef.current = true;
          const title = serverError ? `${serverError} (${status})` : "Video upload failed";
          toast.error(title, serverError ? "Please try again" : msg);
        }
        triggerHaptic("error");
      });
  }, [getVideoUploadDebugData, toast]);

  useEffect(() => {
    return () => {
      resetVideoUploads();
      resetImageUploads();
    };
  }, [resetVideoUploads, resetImageUploads]);

  const getRetryableVideoUris = useCallback(
    () =>
      [...VIDEO_UPLOADS.entries()]
        .filter(([, entry]) => !!entry.error && !entry.isServerError)
        .map(([uri]) => uri),
    [],
  );
  const retryVideoUpload = useCallback(
    (uri: string) => startVideoUpload(uri, true),
    [startVideoUpload],
  );
  useUploadNetworkRetry({
    kind: "video",
    hasFailures: hasFailedUploads,
    getRetryableUris: getRetryableVideoUris,
    retryUpload: retryVideoUpload,
  });

  const getRetryableImageUris = useCallback(
    () =>
      [...IMAGE_UPLOADS.entries()]
        .filter(([, entry]) => !!entry.error && !entry.isServerError)
        .map(([uri]) => uri),
    [],
  );
  const retryImageUpload = useCallback(
    (uri: string) => {
      startImageUpload(uri, true)?.catch((error) => {
        // Failure state and Sentry reporting are handled inside
        // startImageUpload; this only prevents an unhandled rejection.
        Sentry.addBreadcrumb({
          category: "image-upload",
          message: "Network-recovery image retry failed",
          level: "warning",
          data: {
            fileName: uri.split("/").pop() ?? uri,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });
    },
    [startImageUpload],
  );
  useUploadNetworkRetry({
    kind: "image",
    hasFailures: hasFailedImageUploads,
    getRetryableUris: getRetryableImageUris,
    retryUpload: retryImageUpload,
  });

  return {
    getUploadedImageUrls,
    imageUploadsReady,
    imageUploadState,
    isUploadingImage,
    isUploadingVideo,
    resetImageUploads,
    resetVideoUploads,
    setImageUploadState,
    setVideoUploadState,
    startImageUpload,
    startVideoUpload,
    videoUploadControllersRef,
    videoUploadsReady,
    videoUploadState,
  };
}
