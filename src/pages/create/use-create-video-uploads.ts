import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as Network from "expo-network";
import * as Sentry from "@sentry/react-native";

import { uploadVideoAndGetUrl } from "@/src/api/read/hooks/use-upload-media";
import { triggerHaptic } from "@/src/components/utils/haptics";

type ToastApi = {
  error: (title: string, message?: string) => void;
};

export type VideoUploadEntry = {
  url: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
  isServerError?: boolean;
};

export const VIDEO_UPLOADS = new Map<string, VideoUploadEntry>();

export type VideoUploadUiState = {
  progress: number;
  uploading: boolean;
  done: boolean;
  error: string | null;
};

export function useCreateVideoUploads(toast: ToastApi) {
  const [videoUploadState, setVideoUploadState] = useState<
    Record<string, VideoUploadUiState>
  >(() => {
    const init: Record<string, VideoUploadUiState> = {};
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

  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const videoUploadToastShownRef = useRef(false);

  useEffect(() => {
    Network.getNetworkStateAsync().then((state) => {
      setIsNetworkOnline(
        state.isConnected === true && state.isInternetReachable !== false,
      );
    });
    const sub = Network.addNetworkStateListener((event) => {
      setIsNetworkOnline(
        event.isConnected === true && event.isInternetReachable !== false,
      );
    });
    return () => sub.remove();
  }, []);

  const isUploadingVideo = useMemo(() => {
    return Object.values(videoUploadState).some((entry) => entry.uploading);
  }, [videoUploadState]);

  const failedVideoUploads = useMemo(() => {
    return Object.entries(videoUploadState)
      .filter(([, entry]) => entry.error)
      .map(([uri, entry]) => ({ uri, error: entry.error! }));
  }, [videoUploadState]);

  const hasFailedUploads = failedVideoUploads.length > 0;

  const startVideoUpload = useCallback(
    (uri: string, silent = false) => {
      VIDEO_UPLOADS.set(uri, {
        url: null,
        uploading: true,
        progress: 0,
        error: null,
      });
      videoUploadStateRef.current((prev) => ({
        ...prev,
        [uri]: { progress: 0, uploading: true, done: false, error: null },
      }));

      uploadVideoAndGetUrl(uri, (progress) => {
        const clamped = Math.min(100, Math.max(0, progress));
        const entry = VIDEO_UPLOADS.get(uri);
        if (entry) {
          VIDEO_UPLOADS.set(uri, { ...entry, progress: clamped });
        }
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { ...prev[uri], progress: clamped },
        }));
      })
        .then((url) => {
          VIDEO_UPLOADS.set(uri, {
            url,
            uploading: false,
            progress: 100,
            error: null,
          });
          videoUploadStateRef.current((prev) => ({
            ...prev,
            [uri]: { progress: 100, uploading: false, done: true, error: null },
          }));
          videoUploadToastShownRef.current = false;
          triggerHaptic("success");
        })
        .catch((err) => {
          Sentry.addBreadcrumb({
            category: "video-upload",
            message: "Video upload failed",
            data: { error: String(err) },
            level: "error",
          });
          const msg =
            err?.response?.data?.error ||
            (err instanceof Error ? err.message : "Upload failed");
          const isServerError =
            !!err?.response?.status && err.response.status >= 400;
          VIDEO_UPLOADS.set(uri, {
            url: null,
            uploading: false,
            progress: 0,
            error: msg,
            isServerError,
          });
          videoUploadStateRef.current((prev) => ({
            ...prev,
            [uri]: { progress: 0, uploading: false, done: false, error: msg },
          }));
          if (!silent && !videoUploadToastShownRef.current) {
            videoUploadToastShownRef.current = true;
            const serverError = err?.response?.data?.error;
            const status = err?.response?.status;
            const title = serverError
              ? `${serverError} (${status})`
              : "Video upload failed";
            toast.error(title, serverError ? "Please try again" : msg);
          }
          triggerHaptic("error");
        });
    },
    [toast],
  );

  useEffect(() => {
    if (!hasFailedUploads) return;
    let retryScheduled = false;
    const sub = Network.addNetworkStateListener((event) => {
      if (retryScheduled) return;
      if (event.isConnected && event.isInternetReachable !== false) {
        retryScheduled = true;
        setTimeout(() => {
          const toRetry = [...VIDEO_UPLOADS.entries()]
            .filter(([, entry]) => !!entry.error && !entry.isServerError)
            .map(([uri]) => uri);
          toRetry.forEach((uri) => startVideoUpload(uri, true));
        }, 1500);
      }
    });
    Network.getNetworkStateAsync().then((state) => {
      if (retryScheduled) return;
      if (state.isConnected && state.isInternetReachable !== false) {
        retryScheduled = true;
        setTimeout(() => {
          const toRetry = [...VIDEO_UPLOADS.entries()]
            .filter(([, entry]) => !!entry.error && !entry.isServerError)
            .map(([uri]) => uri);
          toRetry.forEach((uri) => startVideoUpload(uri, true));
        }, 3000);
      }
    });
    return () => sub.remove();
  }, [hasFailedUploads, startVideoUpload]);

  const clearVideoUploads = useCallback(() => {
    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
  }, []);

  const removeVideoUpload = useCallback((uri: string) => {
    VIDEO_UPLOADS.delete(uri);
    setVideoUploadState((prev) => {
      const next = { ...prev };
      delete next[uri];
      return next;
    });
  }, []);

  return {
    videoUploadState,
    isNetworkOnline,
    isUploadingVideo,
    failedVideoUploads,
    hasFailedUploads,
    startVideoUpload,
    clearVideoUploads,
    removeVideoUpload,
  };
}
