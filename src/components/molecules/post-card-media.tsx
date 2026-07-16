import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { Audio, AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
} from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import {
  extractYouTubeVideoId,
  getVideoThumbnailUri,
  isHostedStreamVideoUrl,
  type ResolvedMedia,
} from "./post-card-utils";
import { MediaGallery } from "./media-gallery";
import { playNativeVideo } from "@/src/components/utils/native-video-playback";
import {
  buildVideoPositionKey,
  useIsFeedScrolling,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import {
  YouTubeAutoplayEmbed,
  type YouTubeAutoplayEmbedRef,
} from "./youtube-autoplay-embed";
import { useNetworkState } from "@/src/hooks/use-network-state";
import { setLastPressedMediaTransition } from "@/src/utils/post-transition";
import {
  CLOUD_FLARE_PROCESSING_POLL_INTERVAL_MS,
  isCloudflareManifestReady,
} from "./cloudflare-manifest";
import {
  MEDIA_ASPECT_RATIO_CACHE,
  MEDIA_HORIZONTAL_PADDING,
  MEDIA_LOADED_CACHE,
  MEDIA_MAX_HEIGHT,
  SCREEN_WIDTH,
  getMediaAspectRatio,
} from "./post-card-media-constants";
import {
  MediaBlurRevealOverlay,
  MediaOfflineOverlay,
  MediaProcessingOverlay,
  MediaTypeBadge,
} from "./post-card-media-overlays";
import { StyleSheet } from "react-native-unistyles";

export type PostCardMediaRef = {
  pauseVideo: () => void;
};

type PostCardMediaProps = {
  media?: ResolvedMedia;
  mediaList?: ResolvedMedia[];
  isVisible: boolean;
  isFocused?: boolean;
  isNearVisible?: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  allowAutoplay?: boolean;
  screenActive?: boolean;
  disabled?: boolean;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  onGalleryMediaPress?: (index: number) => void;
  isPostDetail?: boolean;
  videoSyncScope?: string;
  postId?: string;
  forceVideoProcessing?: boolean;
  onVideoProcessingComplete?: () => void;
};

let nextNativeAudioFocusId = 0;
const HOSTED_VIDEO_READY_CACHE = new Set<string>();
const COMPLETED_PROCESSING_POST_IDS = new Set<string>();
const VIDEO_PROCESSING_POLL_MAX_MS = 5 * 60 * 1000;
let activeNativeAudioFocus: {
  id: string;
  onLoseFocus: () => void;
} | null = null;

export const PostCardMedia = memo(
  forwardRef<PostCardMediaRef, PostCardMediaProps>(function PostCardMedia(
    {
      media,
      mediaList,
      isVisible,
      isFocused = true,
      isNearVisible,
      shouldBlurContent,
      hasMultipleMedia,
      extraMediaCount,
      allowAutoplay = true,
      screenActive = true,
      disabled = false,
      onRevealContent,
      onMediaPress,
      onGalleryMediaPress,
      isPostDetail = false,
      videoSyncScope,
      postId,
      forceVideoProcessing = false,
      onVideoProcessingComplete,
    },
    ref,
  ) {
    const [imageError, setImageError] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isVideoLoading, setIsVideoLoading] = useState(false);
    const [isVideoProcessing, setIsVideoProcessing] = useState(false);
    const globalMuted = useVideoMuteStore((s) => s.isMuted);
    const toggleMute = useVideoMuteStore((s) => s.toggleMute);
    const nativeAudioFocusIdRef = useRef(`native-video-${++nextNativeAudioFocusId}`);
    const [hasNativeAudioFocus, setHasNativeAudioFocus] = useState(isPostDetail);
    const effectiveMuted = isPostDetail
      ? globalMuted
      : allowAutoplay
        ? (globalMuted || !isFocused)
        : globalMuted;
    const [mediaLoaded, setMediaLoaded] = useState(() => media?.uri ? MEDIA_LOADED_CACHE.has(media.uri) : false);
    const hasDisplayedMediaRef = useRef(mediaLoaded);
    const [videoReadyForDisplay, setVideoReadyForDisplay] = useState(false);
    const videoMuted = media?.type === "video"
      ? (effectiveMuted || !videoReadyForDisplay || (!isPostDetail && !hasNativeAudioFocus))
      : effectiveMuted;
    const [showVideoPrepSpinner, setShowVideoPrepSpinner] = useState(false);
    const [mediaRetryKey, setMediaRetryKey] = useState(0);
    const { isConnected } = useNetworkState();
    const videoRef = useRef<Video | null>(null);
    const youtubeEmbedRef = useRef<YouTubeAutoplayEmbedRef | null>(null);
    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pauseDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoPrepSpinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoErrorRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoErrorRetryCountRef = useRef(0);
    const videoProcessingPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoProcessingStartedAtRef = useRef<number | null>(null);
    const videoProcessingAttemptsRef = useRef(0);
    const processingCompletionReportedRef = useRef(false);
    const focusRecoveryRetryCountRef = useRef(0);
    const mediaFrameRef = useRef<View | null>(null);

    useEffect(() => {
      processingCompletionReportedRef.current = false;
    }, [media?.uri]);

    const reportVideoProcessingComplete = useCallback(() => {
      const completionKey = postId ?? media?.uri;
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
    }, [media?.uri, onVideoProcessingComplete, postId]);

    const aspectRatioLockedRef = useRef(false);
    const userInitiatedPlayRef = useRef(false);
    const prevShouldBlurRef = useRef(shouldBlurContent);
    const isLocalFileMedia = !!media?.uri && media.uri.startsWith("file://");
    const [feedTappedToPlay, setFeedTappedToPlay] = useState(isLocalFileMedia);

    useEffect(() => {
      if (isLocalFileMedia) {
        setFeedTappedToPlay(true);
        setIsVideoPlaying(true);
      }
    }, [isLocalFileMedia, media?.uri]);

    const youtubeVideoId = media?.type === "youtube" ? (extractYouTubeVideoId(media.uri) ?? "") : "";
    const youtubePositionKey = youtubeVideoId
      ? buildVideoPositionKey(youtubeVideoId, videoSyncScope)
      : "";
    const videoPositionKey = media?.type === "video" && media?.uri
      ? buildVideoPositionKey(media.uri, videoSyncScope)
      : "";
    const shouldLazyMountYouTube = Platform.OS === "android" && !isPostDetail;
    const videoThumbnailUri = media?.type === "video" ? getVideoThumbnailUri(media.uri, media.posterUri) : "";
    const youtubeThumbnailUri = youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : "";
    const isFeedScrolling = useIsFeedScrolling(!isPostDetail ? videoSyncScope : undefined);
    const getPosition = useVideoPositionStore((s) => s.getPosition);
    const setPosition = useVideoPositionStore((s) => s.setPosition);
    const lastKnownYouTubeTimeRef = useRef(0);
    const hasRestoredPositionRef = useRef(false);
    const currentVideoPositionRef = useRef(0);
    const hasRestoredVideoPositionRef = useRef(false);

    const saveYouTubePositionSync = useCallback(() => {
      if (!youtubePositionKey) return;
      if (Platform.OS === "android") {
        const t = youtubeEmbedRef.current?.getLastKnownTime?.() ?? lastKnownYouTubeTimeRef.current;
        if (t > 2) setPosition(youtubePositionKey, t);
      } else {
        const t = lastKnownYouTubeTimeRef.current;
        if (t > 2) setPosition(youtubePositionKey, t);
      }
    }, [youtubePositionKey, setPosition]);

    const restoreYouTubePosition = useCallback(() => {
      if (Platform.OS !== "android") return;
      if (!youtubePositionKey || hasRestoredPositionRef.current) return;
      const saved = getPosition(youtubePositionKey);
      if (saved > 2) {
        hasRestoredPositionRef.current = true;
        setTimeout(() => {
          youtubeEmbedRef.current?.seekTo(saved);
          setTimeout(() => youtubeEmbedRef.current?.play(), 600);
        }, 600);
      }
    }, [youtubePositionKey, getPosition]);

    const handleYouTubeTimeUpdate = useCallback((seconds: number) => {
      lastKnownYouTubeTimeRef.current = seconds;
    }, []);

    const saveVideoPosition = useCallback(() => {
      if (media?.type !== "video" || !videoPositionKey) return;
      const seconds = currentVideoPositionRef.current / 1000;
      if (seconds > 0.5) setPosition(videoPositionKey, seconds);
    }, [media?.type, videoPositionKey, setPosition]);

    const saveVideoPositionFresh = useCallback(async () => {
      if (media?.type !== "video" || !videoPositionKey) return;
      try {
        const status = await videoRef.current?.getStatusAsync();
        if (status?.isLoaded) {
          const seconds = status.positionMillis / 1000;
          if (seconds > 0.5) setPosition(videoPositionKey, seconds);
        }
      } catch {
        saveVideoPosition();
      }
    }, [media?.type, videoPositionKey, setPosition, saveVideoPosition]);

    const stopNativeVideoPlayback = useCallback(async (options?: { unload?: boolean }) => {
      if (!videoRef.current) return;

      try {
        const status = await videoRef.current.getStatusAsync();
        if (!status.isLoaded) return;

        await videoRef.current.setStatusAsync({
          shouldPlay: false,
          isMuted: true,
        }).catch(() => {});

        if (options?.unload) {
          await videoRef.current.unloadAsync().catch(() => {});
        }
      } catch {
        // no-op
      }
    }, []);

    useEffect(() => {
      const nativeAudioFocusId = nativeAudioFocusIdRef.current;
      const shouldOwnNativeAudioFocus =
        media?.type === "video" &&
        !isPostDetail &&
        screenActive &&
        !shouldBlurContent &&
        isVisible &&
        isFocused;

      if (shouldOwnNativeAudioFocus) {
        if (activeNativeAudioFocus?.id !== nativeAudioFocusId) {
          activeNativeAudioFocus?.onLoseFocus();
          activeNativeAudioFocus = {
            id: nativeAudioFocusId,
            onLoseFocus: () => {
              setHasNativeAudioFocus(false);
              void stopNativeVideoPlayback();
              setIsVideoPlaying(false);
              setIsVideoLoading(false);
              userInitiatedPlayRef.current = false;
            },
          };
        }
        if (!hasNativeAudioFocus) {
          setHasNativeAudioFocus(true);
        }
      } else if (!isPostDetail && hasNativeAudioFocus) {
        if (activeNativeAudioFocus?.id === nativeAudioFocusId) {
          activeNativeAudioFocus = null;
        }
        setHasNativeAudioFocus(false);
      }

      return () => {
        if (activeNativeAudioFocus?.id === nativeAudioFocusId) {
          activeNativeAudioFocus = null;
        }
      };
    }, [
      media?.type,
      isPostDetail,
      screenActive,
      shouldBlurContent,
      isVisible,
      isFocused,
      hasNativeAudioFocus,
      stopNativeVideoPlayback,
    ]);

    useImperativeHandle(ref, () => ({
      pauseVideo: async () => {
        await saveVideoPositionFresh();
        await stopNativeVideoPlayback();
        saveYouTubePositionSync();
        youtubeEmbedRef.current?.pause();
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
      },
    }));

    useEffect(() => {
      const nativeAudioFocusId = nativeAudioFocusIdRef.current;
      return () => {
        if (media?.type === "video" && videoPositionKey && currentVideoPositionRef.current > 500) {
          useVideoPositionStore.getState().setPosition(videoPositionKey, currentVideoPositionRef.current / 1000);
        }
        void stopNativeVideoPlayback({ unload: true });
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        if (playRetryRef.current) {
          clearInterval(playRetryRef.current);
        }
        if (pauseDelayRef.current) {
          clearTimeout(pauseDelayRef.current);
        }
        if (videoPrepSpinnerTimeoutRef.current) {
          clearTimeout(videoPrepSpinnerTimeoutRef.current);
        }
        if (videoErrorRetryRef.current) {
          clearTimeout(videoErrorRetryRef.current);
        }
        if (videoProcessingPollTimeoutRef.current) {
          clearTimeout(videoProcessingPollTimeoutRef.current);
        }
        if (activeNativeAudioFocus?.id === nativeAudioFocusId) {
          activeNativeAudioFocus = null;
        }
      };
    }, [media?.type, videoPositionKey, stopNativeVideoPlayback]);

    const resolvedMediaUri = media?.uri;

    const getVideoDiagnostics = useCallback(() => ({
      postId,
      mediaType: media?.type,
      isPostDetail,
      isVisible,
      isFocused,
      isConnected,
      mediaRetryKey,
      videoErrorRetryCount: videoErrorRetryCountRef.current,
      processingAttempts: videoProcessingAttemptsRef.current,
    }), [
      postId,
      media?.type,
      isPostDetail,
      isVisible,
      isFocused,
      isConnected,
      mediaRetryKey,
    ]);

    const resolvedMediaUriRef = useRef(resolvedMediaUri);
    useEffect(() => {
      const uriChanged = resolvedMediaUriRef.current !== resolvedMediaUri;
      resolvedMediaUriRef.current = resolvedMediaUri;
      if (uriChanged) {
        hasRestoredVideoPositionRef.current = false;
        currentVideoPositionRef.current = 0;
        focusRecoveryRetryCountRef.current = 0;
        setVideoReadyForDisplay(false);
        setShowVideoPrepSpinner(false);
        const wasLoaded = resolvedMediaUri ? MEDIA_LOADED_CACHE.has(resolvedMediaUri) : false;
        setMediaLoaded(wasLoaded || hasDisplayedMediaRef.current);
        if (!wasLoaded) {
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }
          loadingTimeoutRef.current = setTimeout(() => {
            setMediaLoaded(true);
            if (resolvedMediaUri) MEDIA_LOADED_CACHE.add(resolvedMediaUri);
            setIsVideoLoading(false);
          }, 8000);
        }
      }
    }, [media?.type, resolvedMediaUri]);

    useEffect(() => {
      if (mediaLoaded) {
        hasDisplayedMediaRef.current = true;
      }
    }, [mediaLoaded]);

    useEffect(() => {
      const needsVideoPrep =
        media?.type === "video" &&
        isVideoPlaying &&
        !videoReadyForDisplay &&
        !shouldBlurContent;

      if (!needsVideoPrep) {
        setShowVideoPrepSpinner(false);
        if (videoPrepSpinnerTimeoutRef.current) {
          clearTimeout(videoPrepSpinnerTimeoutRef.current);
          videoPrepSpinnerTimeoutRef.current = null;
        }
        return;
      }

      if (videoPrepSpinnerTimeoutRef.current) {
        clearTimeout(videoPrepSpinnerTimeoutRef.current);
      }

      videoPrepSpinnerTimeoutRef.current = setTimeout(() => {
        setShowVideoPrepSpinner(true);
        videoPrepSpinnerTimeoutRef.current = null;
      }, 220);

      return () => {
        if (videoPrepSpinnerTimeoutRef.current) {
          clearTimeout(videoPrepSpinnerTimeoutRef.current);
          videoPrepSpinnerTimeoutRef.current = null;
        }
      };
    }, [media?.type, isVideoPlaying, shouldBlurContent, videoReadyForDisplay]);

    const cachedAspectRatio = resolvedMediaUri
      ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
      : undefined;
    const targetAspectRatio = cachedAspectRatio ?? getMediaAspectRatio(media);
    const [mediaAspectRatio, setMediaAspectRatio] = useState(targetAspectRatio);

    const prevMediaUriRef = useRef(resolvedMediaUri);
    const uriChanged = prevMediaUriRef.current !== resolvedMediaUri;
    if (uriChanged) {
      prevMediaUriRef.current = resolvedMediaUri;
      aspectRatioLockedRef.current = !!cachedAspectRatio;
      if (Math.abs(mediaAspectRatio - targetAspectRatio) >= 0.01) {
        setMediaAspectRatio(targetAspectRatio);
      }
    } else if (cachedAspectRatio && !aspectRatioLockedRef.current) {
      aspectRatioLockedRef.current = true;
    }

    const effectiveAspectRatio = uriChanged ? targetAspectRatio : mediaAspectRatio;

    useEffect(() => {
      const isPlayable = media?.type === "video" || media?.type === "youtube";
      const canAutoPlayFeedMedia = allowAutoplay && (isPostDetail || isFocused);
      const canAutoPlayCurrentMedia =
        media?.type === "youtube"
          ? ((Platform.OS === "android" && canAutoPlayFeedMedia) || feedTappedToPlay)
          : (isLocalFileMedia || canAutoPlayFeedMedia || feedTappedToPlay);
      if (!isPlayable || shouldBlurContent) {
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        void stopNativeVideoPlayback();
        prevShouldBlurRef.current = shouldBlurContent;
        return;
      }

      const wasBlurred = prevShouldBlurRef.current;
      prevShouldBlurRef.current = shouldBlurContent;

      if (wasBlurred && !shouldBlurContent && screenActive && canAutoPlayCurrentMedia) {
        setIsVideoPlaying(true);
      }

      if ((isVisible || isLocalFileMedia) && screenActive && canAutoPlayCurrentMedia) {
        if (pauseDelayRef.current) {
          clearTimeout(pauseDelayRef.current);
          pauseDelayRef.current = null;
        }
        setIsVideoPlaying(true);
        if (media?.type === "youtube") {
          hasRestoredPositionRef.current = false;
          if (Platform.OS === "android") {
            setIsVideoLoading(true);
            if (playRetryRef.current) clearInterval(playRetryRef.current);
            let attempts = 0;
            playRetryRef.current = setInterval(() => {
              attempts++;
              youtubeEmbedRef.current?.play();
              if (attempts >= 10) {
                if (playRetryRef.current) clearInterval(playRetryRef.current);
                playRetryRef.current = null;
                setIsVideoLoading(false);
              }
            }, 500);
          }
        }
      } else if (!screenActive) {
        if (pauseDelayRef.current) {
          clearTimeout(pauseDelayRef.current);
          pauseDelayRef.current = null;
        }
        if (media?.type === "youtube") saveYouTubePositionSync();
        if (playRetryRef.current) {
          clearInterval(playRetryRef.current);
          playRetryRef.current = null;
        }
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        void stopNativeVideoPlayback();
      } else if ((!isVisible && !isLocalFileMedia) || (!isPostDetail && !canAutoPlayCurrentMedia)) {
        if (pauseDelayRef.current) {
          clearTimeout(pauseDelayRef.current);
          pauseDelayRef.current = null;
        }
        if (media?.type === "youtube") saveYouTubePositionSync();
        if (playRetryRef.current) {
          clearInterval(playRetryRef.current);
          playRetryRef.current = null;
        }
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        void stopNativeVideoPlayback();
      }
    }, [
      media?.type,
      shouldBlurContent,
      isVisible,
      allowAutoplay,
      screenActive,
      resolvedMediaUri,
      feedTappedToPlay,
      isLocalFileMedia,
      isPostDetail,
      isFocused,
      saveYouTubePositionSync,
      stopNativeVideoPlayback,
    ]);

    useEffect(() => {
      if (!isPostDetail && !isVisible && !isLocalFileMedia && feedTappedToPlay) {
        setFeedTappedToPlay(false);
      }
    }, [isPostDetail, isVisible, isLocalFileMedia, feedTappedToPlay]);

    const mediaWasCached = !!(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri));
    const shouldAttemptVideoRecovery =
      media?.type === "video" &&
      mediaWasCached &&
      screenActive &&
      isVisible &&
      !shouldBlurContent &&
      (isPostDetail || isFocused || feedTappedToPlay);

    useEffect(() => {
      if (!shouldAttemptVideoRecovery) return;
      if (videoReadyForDisplay || forceVideoProcessing || isVideoProcessing || imageError) {
        focusRecoveryRetryCountRef.current = 0;
        return;
      }
      if (focusRecoveryRetryCountRef.current >= 2) return;

      const timer = setTimeout(() => {
        if (videoReadyForDisplay || forceVideoProcessing || isVideoProcessing || imageError) return;
        focusRecoveryRetryCountRef.current += 1;
        setMediaRetryKey((k) => k + 1);
      }, 700);

      return () => clearTimeout(timer);
    }, [
      shouldAttemptVideoRecovery,
      videoReadyForDisplay,
      forceVideoProcessing,
      isVideoProcessing,
      imageError,
    ]);

    const shouldAutoPlayYouTube = Platform.OS === "android" && allowAutoplay && (isPostDetail || isFocused);

    const shouldPlayNativeVideo =
      media?.type === "video" &&
      (isVideoPlaying || isLocalFileMedia) &&
      screenActive &&
      !shouldBlurContent;

    useEffect(() => {
      if (videoRef.current && media?.type === "video") {
        videoRef.current.setStatusAsync({ isMuted: videoMuted }).catch(() => {});
      }
    }, [videoMuted, media?.type]);

    useEffect(() => {
      if (!shouldPlayNativeVideo) return;

      let cancelled = false;
      void playNativeVideo(videoRef.current, {
        isMuted: videoMuted,
        isCancelled: () => cancelled || videoRef.current === null,
        component: "post-card-media",
        action: "play-native-feed-video",
        uri: resolvedMediaUri,
      });

      return () => {
        cancelled = true;
      };
    }, [shouldPlayNativeVideo, videoMuted, resolvedMediaUri, mediaLoaded]);

    const wasScreenInactiveForVideoRef = useRef(false);
    useEffect(() => {
      if (media?.type !== "video" || !videoPositionKey) return;
      if (!screenActive) {
        wasScreenInactiveForVideoRef.current = true;
        saveVideoPositionFresh();
      } else if (wasScreenInactiveForVideoRef.current) {
        wasScreenInactiveForVideoRef.current = false;
        const saved = getPosition(videoPositionKey);
        if (saved > 0.5) {
          videoRef.current?.setStatusAsync({ positionMillis: saved * 1000 }).catch(() => {});
        }
        if (!videoReadyForDisplay) {
          setMediaRetryKey((k) => k + 1);
        }
      }
    }, [screenActive, media?.type, videoPositionKey, getPosition, saveVideoPositionFresh, videoReadyForDisplay]);

    const shouldUseAndroidYouTubeEmbed =
      media?.type === "youtube" && Platform.OS === "android";

    const effectiveYouTubeMuted = effectiveMuted;

    const shouldPlayYouTube =
      media?.type === "youtube" &&
      isVideoPlaying &&
      screenActive &&
      !shouldBlurContent;

    const isMediaCached = mediaWasCached;
    const shouldDeferHeavyMedia =
      Platform.OS === "android" &&
      !isPostDetail &&
      !!videoSyncScope &&
      isFeedScrolling &&
      !isFocused &&
      !feedTappedToPlay &&
      !isMediaCached &&
      (media?.type === "video" || media?.type === "youtube");

    const hasServerAspectRatio = !!(
      media?.aspectRatio ||
      (media?.width && media?.height)
    );

    const updateMediaAspectRatioFromSize = useCallback(
      (width?: number, height?: number) => {
        if (hasServerAspectRatio) return;
        if (!width || !height) return;
        const ratio = width / height;
        if (!Number.isFinite(ratio) || ratio <= 0) return;
        setMediaAspectRatio((current) => {
          if (Math.abs(current - ratio) < 0.01) return current;
          return ratio;
        });
        if (resolvedMediaUri) {
          MEDIA_ASPECT_RATIO_CACHE.set(resolvedMediaUri, ratio);
        }
        aspectRatioLockedRef.current = true;
      },
      [hasServerAspectRatio, resolvedMediaUri],
    );

    const mediaSource = useMemo(
      () => ({ uri: resolvedMediaUri ?? "" }),
      [resolvedMediaUri],
    );

    const shouldKeepFeedVideoMounted =
      media?.type === "video" &&
      (isLocalFileMedia || isNearVisible || isFocused || feedTappedToPlay || isVideoPlaying);

    const shouldMountNativeVideo =
      !shouldDeferHeavyMedia && (
        isPostDetail ||
        shouldKeepFeedVideoMounted
      );

    const runWithMediaTransition = useCallback(
      (targetMedia: ResolvedMedia | undefined, run: () => void) => {
        if (isPostDetail || !postId || !targetMedia?.uri || !mediaFrameRef.current) {
          run();
          return;
        }

        let didRun = false;
        const runOnce = () => {
          if (didRun) return;
          didRun = true;
          run();
        };
        const fallback = setTimeout(runOnce, 80);

        mediaFrameRef.current.measureInWindow((x, y, width, height) => {
          clearTimeout(fallback);
          if (width > 0 && height > 0) {
            setLastPressedMediaTransition({
              postId,
              uri: targetMedia.uri,
              previewUri: targetMedia.type === "video"
                ? getVideoThumbnailUri(targetMedia.uri, targetMedia.posterUri)
                : targetMedia.uri,
              type: targetMedia.type,
              x,
              y,
              width,
              height,
            });
          }
          runOnce();
        });
      },
      [isPostDetail, postId],
    );

    const handleGalleryMediaPressWithTransition = useCallback(
      (index: number) => {
        runWithMediaTransition(mediaList?.[index], () => onGalleryMediaPress?.(index));
      },
      [runWithMediaTransition, mediaList, onGalleryMediaPress],
    );

    const handleVideoToggle = useCallback(async () => {
      if (media?.type !== "video") return;
      if (shouldBlurContent) {
        onRevealContent?.();
        return;
      }

      try {
        const status = await videoRef.current?.getStatusAsync();
        if (!status || !status.isLoaded) {
          userInitiatedPlayRef.current = true;
          setIsVideoLoading(true);
          setIsVideoPlaying(true);
          return;
        }
        if (status.isPlaying) {
          await videoRef.current?.pauseAsync();
          setIsVideoPlaying(false);
          setIsVideoLoading(false);
          userInitiatedPlayRef.current = false;
          return;
        }
        userInitiatedPlayRef.current = true;
        if (status.didJustFinish) {
          setIsVideoLoading(true);
          await videoRef.current?.replayAsync();
        } else {
          setIsVideoLoading(true);
          await videoRef.current?.playAsync();
        }
        setIsVideoPlaying(true);
      } catch {
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
      }
    }, [media?.type, onRevealContent, shouldBlurContent]);

    const handleFeedVideoTap = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        if (disabled) return;
        if (isPostDetail) return;
        if (shouldBlurContent) {
          onRevealContent?.();
          return;
        }
        if (!allowAutoplay && !isVideoPlaying && !feedTappedToPlay) {
          setFeedTappedToPlay(true);
          handleVideoToggle();
          return;
        }
        triggerHaptic("selection");
        runWithMediaTransition(media, () => {
          saveVideoPositionFresh();
          onMediaPress?.();
        });
      },
      [disabled, isPostDetail, shouldBlurContent, onRevealContent, allowAutoplay, isVideoPlaying, feedTappedToPlay, handleVideoToggle, runWithMediaTransition, media, onMediaPress, saveVideoPositionFresh],
    );

    const handleFeedYouTubeTap = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        if (disabled) return;
        if (isPostDetail) return;
        if (shouldBlurContent) {
          onRevealContent?.();
          return;
        }
        if (Platform.OS === "android" && !shouldAutoPlayYouTube && !isVideoPlaying && !feedTappedToPlay) {
          setFeedTappedToPlay(true);
          return;
        }
        triggerHaptic("selection");
        runWithMediaTransition(media, () => onMediaPress?.());
      },
      [disabled, isPostDetail, shouldBlurContent, onRevealContent, shouldAutoPlayYouTube, isVideoPlaying, feedTappedToPlay, runWithMediaTransition, media, onMediaPress],
    );

    const resolvedMediaUriForCacheRef = useRef(media?.uri);
    resolvedMediaUriForCacheRef.current = media?.uri;

    const handlePlaybackStatusUpdate = useCallback(
      (status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
          return;
        }
        currentVideoPositionRef.current = status.positionMillis;
        if (status.isPlaying && !status.isBuffering) {
          setShowVideoPrepSpinner(false);
          setIsVideoLoading(false);
          setMediaLoaded(true);
          if (resolvedMediaUriForCacheRef.current) MEDIA_LOADED_CACHE.add(resolvedMediaUriForCacheRef.current);
          userInitiatedPlayRef.current = false;
        } else if (status.isBuffering && !status.isPlaying) {
          const uri = resolvedMediaUriForCacheRef.current;
          if (!uri || !MEDIA_LOADED_CACHE.has(uri)) {
            setIsVideoLoading(true);
          }
        }
      },
      [],
    );

    const handleVideoPress = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        handleVideoToggle();
      },
      [handleVideoToggle],
    );

    const handleMuteToggle = useCallback(
      async (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        triggerHaptic("light");
        const newGlobalMuted = !globalMuted;
        toggleMute();

        if (!newGlobalMuted) {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
          }).catch(() => {});
        }

        if (media?.type === "youtube") {
          if (shouldUseAndroidYouTubeEmbed) {
            const newEffective = isPostDetail
              ? newGlobalMuted
              : allowAutoplay
                ? (newGlobalMuted || !isFocused)
                : newGlobalMuted;
            youtubeEmbedRef.current?.setMuted(newEffective);
          }
          return;
        }

        if (videoRef.current) {
          try {
            const newEffective = isPostDetail
              ? newGlobalMuted
              : allowAutoplay
                ? (newGlobalMuted || !isFocused)
                : newGlobalMuted;
            const newVideoMuted = newEffective || !videoReadyForDisplay;
            await videoRef.current.setStatusAsync({ isMuted: newVideoMuted });
          } catch {}
        }
      },
      [globalMuted, toggleMute, media?.type, shouldUseAndroidYouTubeEmbed, isFocused, isPostDetail, allowAutoplay, videoReadyForDisplay],
    );

    const handleYouTubeTogglePlay = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        setIsVideoPlaying((prev) => {
          const next = !prev;
          if (shouldUseAndroidYouTubeEmbed) {
            if (next) {
              youtubeEmbedRef.current?.play();
            } else {
              youtubeEmbedRef.current?.pause();
            }
          }
          return next;
        });
      },
      [shouldUseAndroidYouTubeEmbed],
    );

    const handleYouTubeSeekBack = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        if (shouldUseAndroidYouTubeEmbed) {
          youtubeEmbedRef.current?.seekBy(-10);
        }
      },
      [shouldUseAndroidYouTubeEmbed],
    );

    const handleYouTubeSeekForward = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        if (shouldUseAndroidYouTubeEmbed) {
          youtubeEmbedRef.current?.seekBy(10);
        }
      },
      [shouldUseAndroidYouTubeEmbed],
    );

    const handleMediaPress = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        if (disabled) return;
        if (shouldBlurContent) {
          onRevealContent?.();
          return;
        }
        triggerHaptic("selection");
        runWithMediaTransition(media, () => {
          saveVideoPosition();
          onMediaPress?.();
        });
      },
      [disabled, shouldBlurContent, onRevealContent, runWithMediaTransition, media, onMediaPress, saveVideoPosition],
    );

    const isHostedStreamVideo = isHostedStreamVideoUrl(media?.uri);
    const isRedgifsVideo = media?.uri?.includes("redgifs.com");
    const isRetryableVideo = isHostedStreamVideo || isRedgifsVideo;
    const showVideoProcessing =
      forceVideoProcessing || (isVideoProcessing && isRetryableVideo);
    const shouldHideOnError =
      imageError && !isRetryableVideo && !isVideoProcessing;

    const wasOfflineRef = useRef(false);
    const wasBackgroundedRef = useRef(false);

    useEffect(() => {
      const sub = AppState.addEventListener("change", (nextState) => {
        if (nextState === "background") {
          wasBackgroundedRef.current = true;
        } else if (nextState === "active" && wasBackgroundedRef.current) {
          wasBackgroundedRef.current = false;
          if (!forceVideoProcessing && (isVideoProcessing || (imageError && isRetryableVideo))) {
            setTimeout(() => {
              setIsVideoProcessing(false);
              setImageError(false);
              setIsVideoLoading(false);
              setMediaRetryKey((k) => k + 1);
            }, 500);
          }
        }
      });
      return () => sub.remove();
    }, [forceVideoProcessing, isVideoProcessing, imageError, isRetryableVideo]);

    useEffect(() => {
      if (!isConnected) {
        wasOfflineRef.current = true;
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
      } else if (wasOfflineRef.current && (isVideoProcessing || imageError)) {
        wasOfflineRef.current = false;
        setTimeout(() => {
          setIsVideoProcessing(false);
          setImageError(false);
          setIsVideoLoading(false);
          setMediaRetryKey((k) => k + 1);
        }, 500);
      } else {
        wasOfflineRef.current = false;
      }
    }, [imageError, isConnected, isVideoProcessing]);

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
        console.log("[PostCardMedia] Cloudflare processing poll started", getVideoDiagnostics());
        Sentry.addBreadcrumb({
          category: "post-media",
          message: "Cloudflare video processing poll started",
          level: "info",
          data: getVideoDiagnostics(),
        });
      }

      let cancelled = false;
      const controller = new AbortController();

      const poll = async () => {
        try {
          const ready = await isCloudflareManifestReady(resolvedMediaUri, controller.signal);
          if (cancelled) return;

          console.log("[PostCardMedia] Cloudflare manifest poll result", {
            ...getVideoDiagnostics(),
            ready,
          });

          if (ready) {
            Sentry.addBreadcrumb({
              category: "post-media",
              message: "Cloudflare video manifest became ready",
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
            setImageError(false);
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
          console.log("[PostCardMedia] Cloudflare manifest poll failed", {
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
          CLOUD_FLARE_PROCESSING_POLL_INTERVAL_MS * (videoProcessingAttemptsRef.current + 1),
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
    ]);

    const containerWidth = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
    const calculatedHeight = containerWidth / effectiveAspectRatio;
    const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;

    const mediaWrapperStyle = exceedsMaxHeight
      ? { height: MEDIA_MAX_HEIGHT }
      : { aspectRatio: effectiveAspectRatio };

    if (!media || shouldHideOnError) return null;

    if (mediaList && mediaList.length > 1) {
      return (
        <View style={styles.mediaContainer}>
          <View ref={mediaFrameRef} style={styles.mediaWrapper}>
            <MediaGallery
              media={mediaList}
              onMediaPress={handleGalleryMediaPressWithTransition}
              screenActive={screenActive}
              allowAutoplay={allowAutoplay}
              isVisible={isVisible}
              isFocused={isFocused}
              isPostDetail={isPostDetail}
              shouldBlurContent={shouldBlurContent}
              onRevealContent={onRevealContent}
            />
            <MediaOfflineOverlay visible={!isConnected && !shouldBlurContent && !mediaLoaded} />
            <View style={styles.borderOverlay} pointerEvents="none" />
          </View>
        </View>
      );
    }

    if (
      __DEV__ &&
      (media.uri?.includes("cloudflarestream") ||
        media.uri?.includes("videodelivery"))
    ) {
      // console.log("[PostCardMedia] Rendering video:", media.uri, "type:", media.type, "imageError:", imageError, "isVideoProcessing:", isVideoProcessing);
    }

    return (
      <View style={styles.mediaContainer}>
        <View ref={mediaFrameRef} style={[styles.mediaWrapper, mediaWrapperStyle]}>
          {media.type === "youtube" ? (
            <>
              {shouldLazyMountYouTube && (!isVisible || shouldDeferHeavyMedia) ? (
                <Pressable onPress={handleFeedYouTubeTap} style={styles.media}>
                  <Image
                    source={{ uri: youtubeThumbnailUri }}
                    style={styles.media}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={youtubeThumbnailUri}
                  />
                  <View style={styles.playOverlay} pointerEvents="none">
                    <View style={styles.playButton}>
                      <Ionicons name="play" size={28} color="#fff" />
                    </View>
                  </View>
                </Pressable>
              ) : shouldUseAndroidYouTubeEmbed ? (
                <YouTubeAutoplayEmbed
                  ref={youtubeEmbedRef}
                  height={exceedsMaxHeight ? MEDIA_MAX_HEIGHT : calculatedHeight}
                  videoId={extractYouTubeVideoId(media.uri) ?? ""}
                  play={shouldPlayYouTube}
                  muted={effectiveYouTubeMuted}
                  autoplay={isVisible && screenActive && !shouldBlurContent && (shouldAutoPlayYouTube || feedTappedToPlay)}
                  controls={false}
                  loop={true}
                  allowFullscreen={false}
                  onPress={isPostDetail ? handleYouTubeTogglePlay : undefined}
                  onReady={() => {
                    setMediaLoaded(true);
                  }}
                  onPlaying={() => {
                    setMediaLoaded(true);
                    setIsVideoLoading(false);
                    setIsVideoPlaying(true);
                    if (playRetryRef.current) {
                      clearInterval(playRetryRef.current);
                      playRetryRef.current = null;
                    }
                    restoreYouTubePosition();
                  }}
                  onTimeUpdate={handleYouTubeTimeUpdate}
                  onStateChange={(state) => {
                    if (state === "playing") {
                      setIsVideoPlaying(true);
                      setIsVideoLoading(false);
                      setMediaLoaded(true);
                      if (playRetryRef.current) {
                        clearInterval(playRetryRef.current);
                        playRetryRef.current = null;
                      }
                    }
                    if (state === "paused" || state === "ended") {
                      setIsVideoPlaying(false);
                    }
                  }}
                />
              ) : (
                <YoutubePlayer
                  height={exceedsMaxHeight ? MEDIA_MAX_HEIGHT : calculatedHeight}
                  videoId={extractYouTubeVideoId(media.uri) ?? ""}
                  play={shouldPlayYouTube}
                  mute={effectiveYouTubeMuted}
                  forceAndroidAutoplay={Platform.OS === "android" && !isPostDetail}
                  initialPlayerParams={{
                    controls: isPostDetail,
                    preventFullScreen: !isPostDetail,
                    rel: false,
                    loop: true,
                  }}
                  onReady={() => {
                    setMediaLoaded(true);
                  }}
                  onChangeState={(event: string) => {
                    if (event === "playing") {
                      setMediaLoaded(true);
                      setIsVideoPlaying(true);
                    }
                    if (event === "paused" || event === "ended") {
                      setIsVideoPlaying(false);
                    }
                  }}
                  webViewProps={{
                    allowsInlineMediaPlayback: true,
                    mediaPlaybackRequiresUserAction: false,
                  }}
                />
              )}
              {!isPostDetail && !shouldBlurContent && (
                <View style={styles.playOverlay}>
                  <Pressable
                    onPress={handleFeedYouTubeTap}
                    style={styles.videoTapArea}
                  />
                  {Platform.OS === "android" && !shouldAutoPlayYouTube && !isVideoPlaying && !feedTappedToPlay ? (
                    <View style={styles.tapToPlayContainer} pointerEvents="none">
                      <Text size="sm" weight="semibold" numberOfLines={1} style={{ color: "#fff" }}>
                        Tap to play
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
              {isPostDetail && shouldUseAndroidYouTubeEmbed && !shouldBlurContent && (
                <>
                  <View style={styles.youtubeControlsContainer} pointerEvents="box-none">
                    <View style={styles.youtubeControlsRow}>
                      <Pressable onPress={handleYouTubeSeekBack} style={styles.youtubeControlButton}>
                        <Ionicons name="play-back" size={18} color="#fff" />
                      </Pressable>
                      <Pressable onPress={handleYouTubeTogglePlay} style={styles.youtubeControlButton}>
                        <Ionicons name={isVideoPlaying ? "pause" : "play"} size={18} color="#fff" />
                      </Pressable>
                      <Pressable onPress={handleYouTubeSeekForward} style={styles.youtubeControlButton}>
                        <Ionicons name="play-forward" size={18} color="#fff" />
                      </Pressable>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      onMediaPress?.();
                    }}
                    style={styles.fullscreenButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View style={styles.fullscreenButtonInner}>
                      <Ionicons name="expand" size={16} color="#fff" />
                    </View>
                  </Pressable>
                </>
              )}
            </>
          ) : media.type === "video" ? (
            <Pressable onPress={isPostDetail ? handleMediaPress : handleFeedVideoTap} style={styles.media}>
              {(videoThumbnailUri && !videoReadyForDisplay) || !shouldMountNativeVideo ? (
                <>
                  <Image
                    source={{ uri: videoThumbnailUri }}
                    style={[styles.media, { position: "absolute", zIndex: 1 }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={videoThumbnailUri}
                    onLoad={({ source }) => {
                      updateMediaAspectRatioFromSize(source?.width, source?.height);
                    }}
                  />
                  {showVideoPrepSpinner ? (
                    <View style={styles.playOverlay} pointerEvents="none">
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
              {shouldMountNativeVideo ? <Video
                key={mediaRetryKey}
                ref={videoRef}
                source={mediaSource}
                style={styles.media}
                resizeMode={ResizeMode.COVER}
                shouldPlay={shouldPlayNativeVideo}
                isLooping={true}
                isMuted={videoMuted}
                useNativeControls={false}
                progressUpdateIntervalMillis={100}
              onLoad={() => {
                  setMediaLoaded(true);
                  if (resolvedMediaUri) MEDIA_LOADED_CACHE.add(resolvedMediaUri);
                  // Playback ownership lives in the shouldPlay prop and the
                  // playNativeVideo effect. onLoad only restores position.
                  if (!hasRestoredVideoPositionRef.current && videoPositionKey) {
                    const saved = getPosition(videoPositionKey);
                    if (saved > 0.5) {
                      hasRestoredVideoPositionRef.current = true;
                      videoRef.current
                        ?.setStatusAsync({ positionMillis: saved * 1000 })
                        .catch(() => {});
                    }
                  }
                }}
                onReadyForDisplay={(event) => {
                  const { width, height } = event.naturalSize ?? {};
                  updateMediaAspectRatioFromSize(width, height);
                  setVideoReadyForDisplay(true);
                  setMediaLoaded(true);
                  if (resolvedMediaUri) {
                    MEDIA_LOADED_CACHE.add(resolvedMediaUri);
                    if (isHostedStreamVideo) HOSTED_VIDEO_READY_CACHE.add(resolvedMediaUri);
                  }
                  if (userInitiatedPlayRef.current) {
                    setIsVideoLoading(false);
                    userInitiatedPlayRef.current = false;
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
                }}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                onError={(error) => {
                  if (__DEV__) {
                    console.log(
                      "[PostCardMedia] Video error:",
                      error,
                      "uri:",
                      mediaSource.uri,
                    );
                  }
                  const isHostedStream = isHostedStreamVideoUrl(mediaSource.uri);
                  const isRedgifs = mediaSource.uri?.includes("redgifs.com");
                  Sentry.captureMessage("Post video playback error", {
                    level: isHostedStream || isRedgifs ? "warning" : "error",
                    tags: {
                      feature: "post-media",
                      operation: "video-playback",
                      retryable: String(isHostedStream || isRedgifs),
                    },
                    extra: {
                      ...getVideoDiagnostics(),
                      uri: mediaSource.uri,
                      error,
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
                    if (!HOSTED_VIDEO_READY_CACHE.has(mediaSource.uri)) {
                      setIsVideoProcessing(true);
                    }
                    setImageError(false);
                    setMediaLoaded(false);
                    setVideoReadyForDisplay(false);
                    void stopNativeVideoPlayback();
                  } else {
                    setImageError(true);
                  }
                  setIsVideoLoading(false);
                }}
              /> : null}
            </Pressable>
          ) : shouldDeferHeavyMedia ? (
            <View style={[styles.media, styles.deferredMediaPlaceholder]}>
              <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.9)" />
              <Text size="sm" weight="medium" style={styles.deferredMediaLabel}>
                Loading image…
              </Text>
            </View>
          ) : (
            <Pressable onPress={handleMediaPress} style={styles.media}>
              <Image
                source={mediaSource}
                style={styles.media}
                contentFit="cover"
                cachePolicy="memory-disk"
                onLoad={({ source }) => {
                  updateMediaAspectRatioFromSize(source?.width, source?.height);
                  setMediaLoaded(true);
                }}
                onError={() => setImageError(true)}
                blurRadius={shouldBlurContent ? 50 : 0}
              />
            </Pressable>
          )}

          {!mediaLoaded && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri)) && !shouldBlurContent && media.type !== "youtube" && isConnected && !showVideoProcessing && (
            <View style={[styles.skeletonOverlay]}>
              <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
            </View>
          )}

          {media.type === "youtube" && isVideoLoading && !shouldBlurContent && (
            <View style={styles.playOverlay} pointerEvents="none">
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            </View>
          )}

          {media.type === "video" &&
            !shouldBlurContent &&
            !showVideoProcessing && (
              <View style={styles.playOverlay}>
                {isPostDetail ? (
                  <>
                    <Pressable
                      onPress={handleVideoPress}
                      style={styles.videoTapArea}
                    />
                    {(isVideoLoading && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri))) || (isVideoPlaying && !mediaLoaded && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri))) ? (
                      <View
                        style={styles.loadingContainer}
                        pointerEvents="none"
                      >
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    ) : !isVideoPlaying ? (
                      <View style={styles.playButton} pointerEvents="none">
                        <Ionicons name="play" size={28} color="#fff" />
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={handleFeedVideoTap}
                      style={styles.videoTapArea}
                    />
                    {(isVideoLoading && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri))) || (isVideoPlaying && !mediaLoaded && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri))) ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    ) : !allowAutoplay && !isVideoPlaying && !feedTappedToPlay ? (
                      <View style={styles.tapToPlayContainer} pointerEvents="none">
                        <Text size="sm" weight="semibold" numberOfLines={1} style={{ color: "#fff" }}>
                          Tap to play
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            )}

          {media.type === "video" &&
            !shouldBlurContent &&
            !showVideoProcessing &&
            isPostDetail && (
              <Pressable
                onPress={() => {
                  saveVideoPosition();
                  onMediaPress?.();
                }}
                style={styles.fullscreenButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.fullscreenButtonInner}>
                  <Ionicons name="expand" size={16} color="#fff" />
                </View>
              </Pressable>
            )}

          {/* Mute/Unmute button for videos */}
          {(media.type === "video" || media.type === "youtube") &&
            !shouldBlurContent &&
            (media.type !== "video" || !showVideoProcessing) &&
            !(media.type === "youtube" && Platform.OS === "ios") && (
              <Pressable
                onPress={handleMuteToggle}
                style={styles.muteButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.muteButtonInner}>
                  <Ionicons
                    name={globalMuted ? "volume-mute" : "volume-high"}
                    size={16}
                    color="#fff"
                  />
                </View>
              </Pressable>
            )}

          {media.type === "youtube" && Platform.OS === "android" && !shouldBlurContent && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                if (media.uri) Linking.openURL(media.uri);
              }}
              style={isPostDetail ? styles.watchOnYouTubeButtonTop : styles.watchOnYouTubeButton}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <View style={styles.watchOnYouTubeInner}>
                <Ionicons name="logo-youtube" size={14} color="#FF0000" />
                <Text size="xs" weight="semibold" style={{ color: "#fff", marginLeft: 4 }}>
                  Watch on YouTube
                </Text>
              </View>
            </Pressable>
          )}

          <MediaProcessingOverlay
            visible={Boolean(isConnected && showVideoProcessing)}
            isRedgifsVideo={Boolean(isRedgifsVideo)}
          />

          <MediaOfflineOverlay visible={!isConnected && !shouldBlurContent && !mediaLoaded} />

          {hasMultipleMedia && (
            <View style={styles.multiMediaBadge}>
              <Text size="xs" weight="semibold" style={{ color: "#fff" }}>
                +{extraMediaCount}
              </Text>
            </View>
          )}

          <MediaBlurRevealOverlay
            visible={shouldBlurContent}
            onRevealContent={onRevealContent}
          />

          <MediaTypeBadge type={media.type} />
          <View style={styles.borderOverlay} pointerEvents="none" />
        </View>
      </View>
    );
  }),
);

const styles = StyleSheet.create((theme) => ({
  mediaContainer: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  mediaWrapper: {
    width: "100%",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.md,
    borderWidth: 0.3,
    borderColor: theme.colors.border.subtle,
    zIndex: 50,
  },
  skeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.md,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  deferredMediaPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background.subtle,
  },
  deferredMediaLabel: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.subtle,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  videoTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  tapToPlayContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlaceholder: {
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  youtubeControlsContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 25,
  },
  youtubeControlsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  youtubeControlButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  watchOnYouTubeButton: {
    position: "absolute",
    bottom: theme.spacing.sm,
    left: theme.spacing.sm,
    zIndex: 30,
  },
  watchOnYouTubeButtonTop: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    zIndex: 30,
  },
  watchOnYouTubeInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
    zIndex: 30,
    elevation: 4,
  },
  muteButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenButton: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    zIndex: 20,
  },
  fullscreenButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  gifBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
  videoBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
  imageBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
  multiMediaBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  blurViewFill: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  revealTextContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  androidBlurOverlay: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 5, 5, 0.97)",
    gap: 8,
  },
}));
