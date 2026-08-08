import * as Sentry from "@sentry/react-native";
import type { VideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { isHostedStreamVideoUrl, type ResolvedMedia } from "./post-card-utils";
import {
  HLS_PROCESSING_POLL_INTERVAL_MS,
  isHlsManifestReady,
} from "@/src/utils/hls-manifest";
import { BoundedLruSet } from "@/src/utils/bounded-lru";

/**
 * Failure handling for post-card native video: playback-error retries,
 * "video is still processing" detection with HLS-manifest polling, offline
 * and focus recovery. Extracted verbatim from the former monolithic
 * PostCardMedia component.
 */

export const HOSTED_VIDEO_READY_CACHE = new BoundedLruSet<string>(256);
const COMPLETED_PROCESSING_POST_IDS = new BoundedLruSet<string>(256);
const VIDEO_PROCESSING_POLL_MAX_MS = 5 * 60 * 1000;

export type PostCardVideoHealthOptions = {
  media: ResolvedMedia;
  isPostDetail: boolean;
  isVisible: boolean;
  isFocused: boolean;
  isConnected: boolean;
  screenActive: boolean;
  shouldBlurContent: boolean;
  feedTappedToPlay: boolean;
  mediaWasCached: boolean;
  forceVideoProcessing: boolean;
  onVideoProcessingComplete?: () => void;
  postId?: string;
  videoPlayer: VideoPlayer;
  stopNativeVideoPlayback: () => Promise<void>;
  videoReadyForDisplay: boolean;
  setVideoReadyForDisplay: (ready: boolean) => void;
  setIsVideoLoading: (loading: boolean) => void;
  setMediaLoaded: (loaded: boolean) => void;
  clearLoadingFallback: () => void;
  mediaRetryKey: number;
  setMediaRetryKey: (update: (key: number) => number) => void;
};

export function usePostCardVideoHealth({
  media,
  isPostDetail,
  isVisible,
  isFocused,
  isConnected,
  screenActive,
  shouldBlurContent,
  feedTappedToPlay,
  mediaWasCached,
  forceVideoProcessing,
  onVideoProcessingComplete,
  postId,
  videoPlayer,
  stopNativeVideoPlayback,
  videoReadyForDisplay,
  setVideoReadyForDisplay,
  setIsVideoLoading,
  setMediaLoaded,
  clearLoadingFallback,
  mediaRetryKey,
  setMediaRetryKey,
}: PostCardVideoHealthOptions) {
  const resolvedMediaUri = media.uri;
  const [videoError, setVideoError] = useState(false);
  const [isVideoProcessing, setIsVideoProcessing] = useState(false);
  const videoErrorRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoErrorRetryCountRef = useRef(0);
  const videoProcessingPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoProcessingStartedAtRef = useRef<number | null>(null);
  const videoProcessingAttemptsRef = useRef(0);
  const processingCompletionReportedRef = useRef(false);
  const focusRecoveryRetryCountRef = useRef(0);
  const wasOfflineRef = useRef(false);
  const wasBackgroundedRef = useRef(false);

  const isHostedStreamVideo = isHostedStreamVideoUrl(resolvedMediaUri);
  const isRedgifsVideo = resolvedMediaUri?.includes("redgifs.com");
  const isRetryableVideo = isHostedStreamVideo || isRedgifsVideo;
  const showVideoProcessing =
    forceVideoProcessing || (isVideoProcessing && !!isRetryableVideo);
  const shouldHideOnError = videoError && !isRetryableVideo && !isVideoProcessing;

  useEffect(() => {
    processingCompletionReportedRef.current = false;
    focusRecoveryRetryCountRef.current = 0;
  }, [resolvedMediaUri]);

  const reportVideoProcessingComplete = useCallback(() => {
    const completionKey = postId ?? resolvedMediaUri;
    if (
      processingCompletionReportedRef.current ||
      !completionKey ||
      COMPLETED_PROCESSING_POST_IDS.has(completionKey)
    ) {
      return;
    }
    processingCompletionReportedRef.current = true;
    COMPLETED_PROCESSING_POST_IDS.add(completionKey);
    onVideoProcessingComplete?.();
  }, [resolvedMediaUri, onVideoProcessingComplete, postId]);

  const getVideoDiagnostics = useCallback(() => ({
    postId,
    mediaType: media.type,
    isPostDetail,
    isVisible,
    isFocused,
    isConnected,
    mediaRetryKey,
    videoErrorRetryCount: videoErrorRetryCountRef.current,
    processingAttempts: videoProcessingAttemptsRef.current,
  }), [
    postId,
    media.type,
    isPostDetail,
    isVisible,
    isFocused,
    isConnected,
    mediaRetryKey,
  ]);

  // Playback errors: retryable hosted-stream/redgifs failures flip into the
  // processing flow; anything else hides the card.
  const mediaSourceUri = resolvedMediaUri ?? "";
  useEffect(() => {
    let subscription: { remove(): void };
    try {
      subscription = videoPlayer.addListener(
        "statusChange",
        ({ status, error }) => {
        if (status !== "error" || !error) return;
        if (__DEV__) {
          console.log(
            "[PostCardVideo] Video error:",
            error.message,
            "uri:",
            mediaSourceUri,
          );
        }
        const isHostedStream = isHostedStreamVideoUrl(mediaSourceUri);
        const isRedgifs = mediaSourceUri?.includes("redgifs.com");
        Sentry.captureMessage("Post video playback error", {
          level: isHostedStream || isRedgifs ? "warning" : "error",
          tags: {
            feature: "post-media",
            operation: "video-playback",
            retryable: String(isHostedStream || isRedgifs),
          },
          extra: {
            ...getVideoDiagnostics(),
            uri: mediaSourceUri,
            error: error.message,
            isHostedStream,
            isRedgifs,
            retryCount: videoErrorRetryCountRef.current,
          },
        });
        if (isHostedStream || isRedgifs) {
          videoErrorRetryCountRef.current += 1;
          if (videoErrorRetryRef.current) {
            clearTimeout(videoErrorRetryRef.current);
            videoErrorRetryRef.current = null;
          }
          if (!HOSTED_VIDEO_READY_CACHE.has(mediaSourceUri)) {
            setIsVideoProcessing(true);
          }
          setVideoError(false);
          setMediaLoaded(false);
          setVideoReadyForDisplay(false);
          void stopNativeVideoPlayback();
        } else {
          setVideoError(true);
        }
        setIsVideoLoading(false);
        },
      );
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "video-player",
        message: "Skipped health listener on released video player",
        level: "warning",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return;
    }

    return () => {
      try {
        subscription.remove();
      } catch {
        // The native shared player may already be released during recycling.
      }
      if (videoErrorRetryRef.current) {
        clearTimeout(videoErrorRetryRef.current);
        videoErrorRetryRef.current = null;
      }
    };
  }, [
    getVideoDiagnostics,
    mediaSourceUri,
    setIsVideoLoading,
    setMediaLoaded,
    setVideoReadyForDisplay,
    stopNativeVideoPlayback,
    videoPlayer,
  ]);

  // Coming back online after an offline failure: clear error state and force
  // a source retry.
  useEffect(() => {
    if (!isConnected) {
      wasOfflineRef.current = true;
      clearLoadingFallback();
    } else if (wasOfflineRef.current && (isVideoProcessing || videoError)) {
      wasOfflineRef.current = false;
      setTimeout(() => {
        setIsVideoProcessing(false);
        setVideoError(false);
        setIsVideoLoading(false);
        setMediaRetryKey((k) => k + 1);
      }, 500);
    } else {
      wasOfflineRef.current = false;
    }
  }, [videoError, isConnected, isVideoProcessing, clearLoadingFallback, setIsVideoLoading, setMediaRetryKey]);

  // Returning from background/lock with a stuck processing/error state:
  // retry. iOS screen lock often only reports `inactive` (BUG-009).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState.match(/inactive|background/)) {
        wasBackgroundedRef.current = true;
      } else if (nextState === "active" && wasBackgroundedRef.current) {
        wasBackgroundedRef.current = false;
        if (!forceVideoProcessing && (isVideoProcessing || (videoError && isRetryableVideo))) {
          setTimeout(() => {
            setIsVideoProcessing(false);
            setVideoError(false);
            setIsVideoLoading(false);
            setMediaRetryKey((k) => k + 1);
          }, 500);
        }
      }
    });
    return () => sub.remove();
  }, [
    forceVideoProcessing,
    isVideoProcessing,
    videoError,
    isRetryableVideo,
    setIsVideoLoading,
    setMediaRetryKey,
  ]);

  // A cached video that should be showing but never produced a frame after a
  // focus change gets a couple of silent source retries.
  const shouldAttemptVideoRecovery =
    mediaWasCached &&
    screenActive &&
    isVisible &&
    !shouldBlurContent &&
    (isPostDetail || isFocused || feedTappedToPlay);

  useEffect(() => {
    if (!shouldAttemptVideoRecovery) return;
    if (videoReadyForDisplay || forceVideoProcessing || isVideoProcessing || videoError) {
      focusRecoveryRetryCountRef.current = 0;
      return;
    }
    if (focusRecoveryRetryCountRef.current >= 2) return;

    const timer = setTimeout(() => {
      if (videoReadyForDisplay || forceVideoProcessing || isVideoProcessing || videoError) return;
      focusRecoveryRetryCountRef.current += 1;
      setMediaRetryKey((k) => k + 1);
    }, 700);

    return () => clearTimeout(timer);
  }, [
    shouldAttemptVideoRecovery,
    videoReadyForDisplay,
    forceVideoProcessing,
    isVideoProcessing,
    videoError,
    setMediaRetryKey,
  ]);

  // While the backend is still transcoding, poll the HLS manifest until it
  // becomes playable, then retry the source.
  useEffect(() => {
    if (!showVideoProcessing || !isHostedStreamVideo || !resolvedMediaUri) {
      videoProcessingStartedAtRef.current = null;
      if (videoProcessingPollTimeoutRef.current) {
        clearTimeout(videoProcessingPollTimeoutRef.current);
        videoProcessingPollTimeoutRef.current = null;
      }
      return;
    }

    if (!videoProcessingStartedAtRef.current) {
      videoProcessingStartedAtRef.current = Date.now();
      console.log("[PostCardVideo] Hosted video processing poll started", getVideoDiagnostics());
      Sentry.addBreadcrumb({
        category: "post-media",
        message: "Hosted video processing poll started",
        level: "info",
        data: getVideoDiagnostics(),
      });
    }

    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const ready = await isHlsManifestReady(resolvedMediaUri, controller.signal);
        if (cancelled) return;

        console.log("[PostCardVideo] Hosted video manifest poll result", {
          ...getVideoDiagnostics(),
          ready,
        });

        if (ready) {
          Sentry.addBreadcrumb({
            category: "post-media",
            message: "Hosted video manifest became ready",
            level: "info",
            data: {
              ...getVideoDiagnostics(),
              attempts: videoProcessingAttemptsRef.current,
              elapsedMs: videoProcessingStartedAtRef.current
                ? Date.now() - videoProcessingStartedAtRef.current
                : undefined,
            },
          });
          videoProcessingStartedAtRef.current = null;
          if (videoProcessingPollTimeoutRef.current) {
            clearTimeout(videoProcessingPollTimeoutRef.current);
            videoProcessingPollTimeoutRef.current = null;
          }
          setIsVideoProcessing(false);
          setVideoError(false);
          setIsVideoLoading(false);
          setMediaLoaded(false);
          setVideoReadyForDisplay(false);
          videoProcessingAttemptsRef.current = 0;
          HOSTED_VIDEO_READY_CACHE.add(resolvedMediaUri);
          reportVideoProcessingComplete();
          setMediaRetryKey((k) => k + 1);
          return;
        }
      } catch (error) {
        if (cancelled) return;
        console.log("[PostCardVideo] Hosted video manifest poll failed", {
          ...getVideoDiagnostics(),
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (cancelled) return;
      if (
        videoProcessingStartedAtRef.current &&
        Date.now() - videoProcessingStartedAtRef.current >= VIDEO_PROCESSING_POLL_MAX_MS
      ) {
        Sentry.addBreadcrumb({
          category: "post-media",
          message: "Hosted video processing poll reached time limit",
          level: "warning",
          data: getVideoDiagnostics(),
        });
        return;
      }
      const nextDelay = Math.min(
        HLS_PROCESSING_POLL_INTERVAL_MS * (videoProcessingAttemptsRef.current + 1),
        10000,
      );
      videoProcessingAttemptsRef.current += 1;
      videoProcessingPollTimeoutRef.current = setTimeout(() => {
        void poll();
      }, nextDelay);
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (videoProcessingPollTimeoutRef.current) {
        clearTimeout(videoProcessingPollTimeoutRef.current);
        videoProcessingPollTimeoutRef.current = null;
      }
    };
  }, [
    showVideoProcessing,
    isHostedStreamVideo,
    resolvedMediaUri,
    getVideoDiagnostics,
    reportVideoProcessingComplete,
    setIsVideoLoading,
    setMediaLoaded,
    setMediaRetryKey,
    setVideoReadyForDisplay,
  ]);

  // First-frame bookkeeping shared with the component's onFirstFrameRender.
  const handleFirstFrameHealth = useCallback(() => {
    if (resolvedMediaUri && isHostedStreamVideo) {
      HOSTED_VIDEO_READY_CACHE.add(resolvedMediaUri);
    }
    if (isVideoProcessing) {
      setIsVideoProcessing(false);
    }
    if (forceVideoProcessing) {
      reportVideoProcessingComplete();
    }
    videoProcessingStartedAtRef.current = null;
    if (videoProcessingPollTimeoutRef.current) {
      clearTimeout(videoProcessingPollTimeoutRef.current);
      videoProcessingPollTimeoutRef.current = null;
    }
    focusRecoveryRetryCountRef.current = 0;
    videoErrorRetryCountRef.current = 0;
    if (videoErrorRetryRef.current) {
      clearTimeout(videoErrorRetryRef.current);
      videoErrorRetryRef.current = null;
    }
  }, [
    forceVideoProcessing,
    isHostedStreamVideo,
    isVideoProcessing,
    reportVideoProcessingComplete,
    resolvedMediaUri,
  ]);

  return {
    videoError,
    isVideoProcessing,
    isHostedStreamVideo,
    isRedgifsVideo,
    isRetryableVideo,
    showVideoProcessing,
    shouldHideOnError,
    reportVideoProcessingComplete,
    handleFirstFrameHealth,
  };
}
