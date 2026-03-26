import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent, useEventListener } from "expo";
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
  Dimensions,
  Linking,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import YoutubePlayer from "react-native-youtube-iframe";
import type { YoutubeIframeRef } from "react-native-youtube-iframe";
import { extractYouTubeVideoId, type ResolvedMedia } from "./post-card-utils";
import { MediaGallery } from "./media-gallery";
import {
  buildVideoPositionKey,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import {
  YouTubeAutoplayEmbed,
  type YouTubeAutoplayEmbedRef,
} from "./youtube-autoplay-embed";
import { useNetworkState } from "@/src/hooks/use-network-state";


const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_MAX_HEIGHT = 450;
const MEDIA_HORIZONTAL_PADDING = 32;

export type PostCardMediaRef = {
  pauseVideo: () => void;
};

type PostCardMediaProps = {
  media?: ResolvedMedia;
  mediaList?: ResolvedMedia[];
  isVisible: boolean;
  isFocused?: boolean;
  preloadNearby?: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  allowAutoplay?: boolean;
  screenActive?: boolean;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  onGalleryMediaPress?: (index: number) => void;
  isPostDetail?: boolean;
  videoSyncScope?: string;
};

const MEDIA_ASPECT_RATIO_CACHE = new Map<string, number>();
const MEDIA_LOADED_CACHE = new Set<string>();

function getVideoThumbnailUri(uri?: string): string {
  if (!uri) return "";
  if (uri.includes("cloudflarestream.com") || uri.includes("videodelivery.net")) {
    const match = uri.match(/(?:cloudflarestream\.com|videodelivery\.net)\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return `https://videodelivery.net/${match[1]}/thumbnails/thumbnail.jpg?time=1s&width=480`;
  }
  if (uri.includes("redgifs.com") && uri.includes("-mobile.mp4")) {
    return uri.replace("-mobile.mp4", "-poster.jpg");
  }
  if (uri.includes("redgifs.com") && uri.endsWith(".mp4")) {
    return uri.replace(".mp4", "-poster.jpg");
  }
  return "";
}

function getMediaAspectRatio(media?: ResolvedMedia): number {
  if (!media) return 16 / 9;
  const cached = media.uri
    ? MEDIA_ASPECT_RATIO_CACHE.get(media.uri)
    : undefined;
  if (cached) return cached;
  if (media.aspectRatio) return media.aspectRatio;
  if (media.width && media.height) {
    return media.width / media.height;
  }
  if (media.type === "video") return 4 / 3;
  return 16 / 9;
}

export const PostCardMedia = memo(
  forwardRef<PostCardMediaRef, PostCardMediaProps>(function PostCardMedia(
    {
      media,
      mediaList,
      isVisible,
      isFocused = true,
      preloadNearby = false,
      shouldBlurContent,
      hasMultipleMedia,
      extraMediaCount,
      allowAutoplay = true,
      screenActive = true,
      onRevealContent,
      onMediaPress,
      onGalleryMediaPress,
      isPostDetail = false,
      videoSyncScope,
    },
    ref,
  ) {
    const [imageError, setImageError] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isVideoLoading, setIsVideoLoading] = useState(false);
    const [isVideoProcessing, setIsVideoProcessing] = useState(false);
    const globalMuted = useVideoMuteStore((s) => s.isMuted);
    const toggleMute = useVideoMuteStore((s) => s.toggleMute);
    const effectiveMuted = isPostDetail
      ? globalMuted
      : allowAutoplay
        ? (globalMuted || !isFocused)
        : globalMuted;
    const [mediaLoaded, setMediaLoaded] = useState(() => media?.uri ? MEDIA_LOADED_CACHE.has(media.uri) : false);
    const [videoFirstFrameRendered, setVideoFirstFrameRendered] = useState(false);
    const [mediaRetryKey, setMediaRetryKey] = useState(0);
    const { isConnected } = useNetworkState();
    const youtubeEmbedRef = useRef<YouTubeAutoplayEmbedRef | null>(null);
    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pauseDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoErrorRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoErrorRetryCountRef = useRef(0);

    const aspectRatioLockedRef = useRef(false);
    const prevShouldBlurRef = useRef(shouldBlurContent);
    const [feedTappedToPlay, setFeedTappedToPlay] = useState(false);

    const youtubeVideoId = media?.type === "youtube" ? (extractYouTubeVideoId(media.uri) ?? "") : "";
    const youtubePositionKey = youtubeVideoId
      ? buildVideoPositionKey(youtubeVideoId, videoSyncScope)
      : "";
    const videoPositionKey = media?.type === "video" && media?.uri
      ? buildVideoPositionKey(media.uri, videoSyncScope)
      : "";
    const shouldLazyMountYouTube = Platform.OS === "android" && !isPostDetail;
    const videoThumbnailUri = media?.type === "video" ? getVideoThumbnailUri(media.uri) : "";
    const youtubeThumbnailUri = youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : "";
    const getPosition = useVideoPositionStore((s) => s.getPosition);
    const setPosition = useVideoPositionStore((s) => s.setPosition);
    const lastKnownYouTubeTimeRef = useRef(0);
    const hasRestoredPositionRef = useRef(false);
    const currentVideoTimeRef = useRef(0);
    const hasRestoredVideoPositionRef = useRef(false);

    const resolvedMediaUri = media?.uri;
    const isVideoType = media?.type === "video";
    const isHls = !!resolvedMediaUri?.includes(".m3u8");

    const shouldCreatePlayer = isVideoType && !shouldBlurContent && isVisible;
    const videoSource = useMemo(
      () => shouldCreatePlayer && resolvedMediaUri ? { uri: resolvedMediaUri, useCaching: !isHls } : null,
      [shouldCreatePlayer, resolvedMediaUri, isHls],
    );

    const player = useVideoPlayer(videoSource, (p) => {
      p.loop = true;
      p.muted = true;
      p.timeUpdateEventInterval = isPostDetail ? 0.25 : 0.5;
    });

    const { status: playerStatus } = useEvent(player, "statusChange", { status: player.status });
    const { isPlaying: playerIsPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

    useEventListener(player, "sourceLoad", ({ availableVideoTracks }) => {
      const track = availableVideoTracks?.[0];
      if (track?.size?.width && track?.size?.height) {
        updateMediaAspectRatioFromSize(track.size.width, track.size.height);
      }
    });

    useEventListener(player, "timeUpdate", ({ currentTime }) => {
      currentVideoTimeRef.current = currentTime;
    });

    useEffect(() => {
      if (playerStatus === "readyToPlay") {
        setMediaLoaded(true);
        if (resolvedMediaUri) MEDIA_LOADED_CACHE.add(resolvedMediaUri);
        setIsVideoLoading(false);
        videoErrorRetryCountRef.current = 0;
        if (videoErrorRetryRef.current) {
          clearTimeout(videoErrorRetryRef.current);
          videoErrorRetryRef.current = null;
        }
        if (isVideoProcessing) {
          setIsVideoProcessing(false);
        }
        if (!hasRestoredVideoPositionRef.current && videoPositionKey) {
          const saved = getPosition(videoPositionKey);
          if (saved > 0.5) {
            hasRestoredVideoPositionRef.current = true;
            try { player.currentTime = saved; } catch {}
          }
        }
      }
      if (playerStatus === "loading") {
        if (!resolvedMediaUri || !MEDIA_LOADED_CACHE.has(resolvedMediaUri)) {
          setIsVideoLoading(true);
        }
      }
      if (playerStatus === "error") {
        const isCloudflare =
          resolvedMediaUri?.includes("cloudflarestream.com") ||
          resolvedMediaUri?.includes("videodelivery.net");
        const isRedgifs = resolvedMediaUri?.includes("redgifs.com");
        if (isCloudflare || isRedgifs) {
          setIsVideoProcessing(true);
          if (videoErrorRetryCountRef.current < 3) {
            videoErrorRetryCountRef.current += 1;
            if (videoErrorRetryRef.current) clearTimeout(videoErrorRetryRef.current);
            videoErrorRetryRef.current = setTimeout(() => {
              setIsVideoProcessing(false);
              setImageError(false);
              setIsVideoLoading(false);
              setMediaRetryKey((k) => k + 1);
            }, 2000 * videoErrorRetryCountRef.current);
          } else {
            if (videoErrorRetryRef.current) clearTimeout(videoErrorRetryRef.current);
            videoErrorRetryRef.current = setTimeout(() => {
              setIsVideoProcessing(false);
            }, 5000);
          }
        } else {
          setImageError(true);
        }
        setIsVideoLoading(false);
      }
    }, [playerStatus]);

    useEffect(() => {
      setIsVideoPlaying(playerIsPlaying);
    }, [playerIsPlaying]);

    const shouldVideoPlay =
      isVideoType &&
      !shouldBlurContent &&
      (allowAutoplay || feedTappedToPlay) &&
      isVisible &&
      screenActive;

    useEffect(() => {
      if (!player) return;
      try {
        if (shouldVideoPlay) {
          player.play();
        } else {
          player.pause();
        }
      } catch {}
    }, [shouldVideoPlay, player]);

    useEffect(() => {
      if (!player) return;
      try {
        player.muted = effectiveMuted;
      } catch {}
    }, [effectiveMuted, player]);

    const shouldShowVideoThumbnail = !!videoThumbnailUri && (
      shouldBlurContent ||
      !isVisible ||
      !isVideoPlaying ||
      playerStatus !== "readyToPlay" ||
      !videoFirstFrameRendered
    );

    const prevScreenActiveRef = useRef(screenActive);
    useEffect(() => {
      if (!isVideoType || !videoPositionKey) return;
      const wasInactive = !prevScreenActiveRef.current;
      prevScreenActiveRef.current = screenActive;

      if (!screenActive && currentVideoTimeRef.current > 0.5) {
        setPosition(videoPositionKey, currentVideoTimeRef.current);
      }
      if (screenActive && wasInactive && player) {
        hasRestoredVideoPositionRef.current = false;
        const saved = getPosition(videoPositionKey);
        if (saved > 0.5) {
          hasRestoredVideoPositionRef.current = true;
          try { player.currentTime = saved; } catch {}
        }
      }
    }, [screenActive, isVideoType, videoPositionKey, setPosition, getPosition, player]);

    useEffect(() => {
      return () => {
        if (videoPositionKey && currentVideoTimeRef.current > 0.5) {
          useVideoPositionStore.getState().setPosition(videoPositionKey, currentVideoTimeRef.current);
        }
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        if (playRetryRef.current) clearInterval(playRetryRef.current);
        if (pauseDelayRef.current) clearTimeout(pauseDelayRef.current);
        if (videoErrorRetryRef.current) clearTimeout(videoErrorRetryRef.current);
      };
    }, [videoPositionKey]);

    const saveVideoPosition = useCallback(() => {
      if (videoPositionKey && currentVideoTimeRef.current > 0.5) {
        setPosition(videoPositionKey, currentVideoTimeRef.current);
      }
    }, [videoPositionKey, setPosition]);

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

    useImperativeHandle(ref, () => ({
      pauseVideo: () => {
        saveVideoPosition();
        if (player) {
          try { player.pause(); } catch {}
        }
        saveYouTubePositionSync();
        youtubeEmbedRef.current?.pause();
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
      },
    }));

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
      const canAutoPlayCurrentMedia =
        media?.type === "youtube"
          ? ((Platform.OS === "android" && allowAutoplay) || feedTappedToPlay)
          : (allowAutoplay || feedTappedToPlay);
      if (!isPlayable || shouldBlurContent) {
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        prevShouldBlurRef.current = shouldBlurContent;
        return;
      }

      const wasBlurred = prevShouldBlurRef.current;
      prevShouldBlurRef.current = shouldBlurContent;

      if (wasBlurred && !shouldBlurContent && screenActive && canAutoPlayCurrentMedia) {
        setIsVideoPlaying(true);
      }

      if (isVisible && screenActive && canAutoPlayCurrentMedia) {
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
      } else if (!isVisible) {
        if (!pauseDelayRef.current) {
          pauseDelayRef.current = setTimeout(() => {
            pauseDelayRef.current = null;
            if (media?.type === "youtube") saveYouTubePositionSync();
            if (playRetryRef.current) {
              clearInterval(playRetryRef.current);
              playRetryRef.current = null;
            }
            setIsVideoPlaying(false);
            setIsVideoLoading(false);
          }, 400);
        }
      }
    }, [
      media?.type,
      shouldBlurContent,
      isVisible,
      allowAutoplay,
      screenActive,
      resolvedMediaUri,
      feedTappedToPlay,
      saveYouTubePositionSync,
    ]);

    const shouldAutoPlayYouTube = Platform.OS === "android" && allowAutoplay;

    const shouldUseAndroidYouTubeEmbed =
      media?.type === "youtube" && Platform.OS === "android";

    const effectiveYouTubeMuted = effectiveMuted;

    const shouldPlayYouTube =
      media?.type === "youtube" &&
      isVideoPlaying &&
      screenActive &&
      !shouldBlurContent;

    const updateMediaAspectRatioFromSize = useCallback(
      (width?: number, height?: number) => {
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
      [resolvedMediaUri],
    );

    const mediaSource = useMemo(
      () => ({ uri: resolvedMediaUri ?? "" }),
      [resolvedMediaUri],
    );

    const handleVideoToggle = useCallback(() => {
      if (!isVideoType || !player) return;
      if (shouldBlurContent) {
        onRevealContent?.();
        return;
      }
      try {
        if (isVideoPlaying) {
          player.pause();
          setIsVideoPlaying(false);
        } else {
          player.play();
          setIsVideoPlaying(true);
        }
      } catch {}
    }, [isVideoType, shouldBlurContent, onRevealContent, isVideoPlaying, player]);

    const handleFeedVideoTap = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
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
        saveVideoPosition();
        onMediaPress?.();
      },
      [isPostDetail, shouldBlurContent, onRevealContent, allowAutoplay, isVideoPlaying, feedTappedToPlay, handleVideoToggle, onMediaPress, saveVideoPosition],
    );

    const handleFeedYouTubeTap = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
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
        onMediaPress?.();
      },
      [isPostDetail, shouldBlurContent, onRevealContent, shouldAutoPlayYouTube, isVideoPlaying, feedTappedToPlay, onMediaPress],
    );

    const handleVideoPress = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        handleVideoToggle();
      },
      [handleVideoToggle],
    );

    const handleMuteToggle = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        triggerHaptic("light");
        toggleMute();

        if (media?.type === "youtube") {
          if (shouldUseAndroidYouTubeEmbed) {
            const newGlobalMuted = !globalMuted;
            const newEffective = isPostDetail
              ? newGlobalMuted
              : allowAutoplay
                ? (newGlobalMuted || !isFocused)
                : newGlobalMuted;
            youtubeEmbedRef.current?.setMuted(newEffective);
          }
          return;
        }
      },
      [globalMuted, toggleMute, media?.type, shouldUseAndroidYouTubeEmbed, isFocused, isPostDetail, allowAutoplay],
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
        if (shouldBlurContent) {
          onRevealContent?.();
          return;
        }
        triggerHaptic("selection");
        saveVideoPosition();
        if (player) try { player.pause(); } catch {}
        onMediaPress?.();
      },
      [shouldBlurContent, onRevealContent, onMediaPress, saveVideoPosition, player],
    );

    const isCloudflareVideo =
      media?.uri?.includes("cloudflarestream.com") ||
      media?.uri?.includes("videodelivery.net");
    const isRedgifsVideo = media?.uri?.includes("redgifs.com");
    const isRetryableVideo = isCloudflareVideo || isRedgifsVideo;
    const shouldHideOnError =
      imageError && !isRetryableVideo && !isVideoProcessing;

    const wasOfflineRef = useRef(false);
    const wasBackgroundedRef = useRef(false);

    useEffect(() => {
      if (!isVideoType) return;
      const sub = AppState.addEventListener("change", (nextState) => {
        if (nextState === "background") {
          wasBackgroundedRef.current = true;
        } else if (nextState === "active" && wasBackgroundedRef.current) {
          wasBackgroundedRef.current = false;
          if (isVideoProcessing || (imageError && isRetryableVideo)) {
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
    }, [isVideoType, isVideoProcessing, imageError, isRetryableVideo]);

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
    }, [isConnected]);

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
          <View style={styles.mediaWrapper}>
            <MediaGallery
              media={mediaList}
              onMediaPress={onGalleryMediaPress}
              screenActive={screenActive}
              allowAutoplay={allowAutoplay}
              isVisible={isVisible}
              isFocused={isFocused}
              isPostDetail={isPostDetail}
             shouldBlurContent={shouldBlurContent}
             onRevealContent={onRevealContent}
            />
            {!isConnected && !shouldBlurContent && !mediaLoaded && (
              <View style={styles.processingOverlay}>
                <Ionicons name="cloud-offline-outline" size={32} color="#fff" />
                <Text
                  size="sm"
                  weight="semibold"
                  style={{ color: "#fff", marginTop: 8 }}
                >
                  No internet connection
                </Text>
                <Text
                  size="xs"
                  style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}
                >
                  Check your network and try again
                </Text>
              </View>
            )}
            <View style={styles.borderOverlay} pointerEvents="none" />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.mediaContainer}>
        <View style={[styles.mediaWrapper, mediaWrapperStyle]}>
          {media.type === "youtube" ? (
            <>
              {shouldLazyMountYouTube && !isVisible ? (
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
              {shouldShowVideoThumbnail ? (
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
              ) : null}
              <VideoView
                player={player}
                style={styles.media}
                contentFit="cover"
                nativeControls={false}
                useExoShutter={false}
                onFirstFrameRender={() => {
                  setVideoFirstFrameRendered(true);
                  setMediaLoaded(true);
                  if (resolvedMediaUri) MEDIA_LOADED_CACHE.add(resolvedMediaUri);
                }}
              />
            </Pressable>
          ) : (
            <Pressable onPress={handleMediaPress} style={styles.media}>
              <Image
                source={mediaSource}
                style={styles.media}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={resolvedMediaUri}
                onLoad={({ source }) => {
                  updateMediaAspectRatioFromSize(source?.width, source?.height);
                  setMediaLoaded(true);
                }}
                onError={() => setImageError(true)}
                blurRadius={shouldBlurContent ? 50 : 0}
              />
            </Pressable>
          )}

          {!mediaLoaded && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri)) && !shouldBlurContent && media.type !== "youtube" && isConnected && !isVideoProcessing && (
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
            !isVideoProcessing && (
              <View style={styles.playOverlay}>
                {isPostDetail ? (
                  <>
                    <Pressable
                      onPress={handleVideoPress}
                      style={styles.videoTapArea}
                    />
                    {playerStatus === "loading" && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri)) ? (
                      <View
                        style={styles.loadingContainer}
                        pointerEvents="none"
                      >
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    ) : !isVideoPlaying && playerStatus === "readyToPlay" ? (
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
                    {playerStatus === "loading" && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri)) ? (
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
            !isVideoProcessing &&
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

          {(media.type === "video" || media.type === "youtube") &&
            !shouldBlurContent &&
            (media.type !== "video" || !isVideoProcessing) &&
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

          {isVideoProcessing && isRetryableVideo && isConnected && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text
                size="sm"
                weight="semibold"
                style={{ color: "#fff", marginTop: 8 }}
              >
                {isRedgifsVideo ? "Loading video..." : "Video processing..."}
              </Text>
              <Text
                size="xs"
                style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}
              >
                {isRedgifsVideo ? "Retrying..." : "This may take a few moments"}
              </Text>
            </View>
          )}

          {!isConnected && !shouldBlurContent && !mediaLoaded && (
            <View style={styles.processingOverlay}>
              <Ionicons name="cloud-offline-outline" size={32} color="#fff" />
              <Text
                size="sm"
                weight="semibold"
                style={{ color: "#fff", marginTop: 8 }}
              >
                No internet connection
              </Text>
              <Text
                size="xs"
                style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}
              >
                Check your network and try again
              </Text>
            </View>
          )}

          {hasMultipleMedia && (
            <View style={styles.multiMediaBadge}>
              <Text size="xs" weight="semibold" style={{ color: "#fff" }}>
                +{extraMediaCount}
              </Text>
            </View>
          )}

          {shouldBlurContent && (
            <Pressable onPress={onRevealContent} style={styles.blurOverlay}>
              {Platform.OS === "ios" ? (
                <BlurView
                  intensity={80}
                  tint="dark"
                  style={styles.blurViewFill}
                >
                  <View style={styles.revealTextContainer}>
                    <Ionicons name="eye-outline" size={24} color="#fff" />
                    <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                      Tap to reveal
                    </Text>
                  </View>
                </BlurView>
              ) : (
                <View style={styles.androidBlurOverlay}>
                  <Ionicons name="eye-outline" size={24} color="#fff" />
                  <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                    Tap to reveal
                  </Text>
                </View>
              )}
            </Pressable>
          )}

          {media.type === "video" && (
            <View style={styles.videoBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                VIDEO
              </Text>
            </View>
          )}

          {media.type === "gif" && (
            <View style={styles.gifBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                GIF
              </Text>
            </View>
          )}

          {media.type === "image" && (
            <View style={styles.imageBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                IMG
              </Text>
            </View>
          )}
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
