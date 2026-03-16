import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
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
import { type ImageLoadEventData } from "expo-image";
import {
  ActivityIndicator,
  Dimensions,
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
import { useVideoMuteStore, useVideoPositionStore } from "@/src/stores";
import {
  YouTubeAutoplayEmbed,
  type YouTubeAutoplayEmbedRef,
} from "./youtube-autoplay-embed";
import { useNetworkState } from "@/src/hooks/use-network-state";


const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_MAX_HEIGHT = 450;
const MEDIA_HORIZONTAL_PADDING = 32; // md padding * 2

export type PostCardMediaRef = {
  pauseVideo: () => void;
};

type PostCardMediaProps = {
  media?: ResolvedMedia;
  mediaList?: ResolvedMedia[];
  isVisible: boolean;
  isFocused?: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  allowAutoplay?: boolean;
  screenActive?: boolean;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  onGalleryMediaPress?: (index: number) => void;
  isPostDetail?: boolean;
};

const MEDIA_ASPECT_RATIO_CACHE = new Map<string, number>();
const MEDIA_LOADED_CACHE = new Set<string>();

function getVideoThumbnailUri(uri?: string): string {
  if (!uri) return "";
  if (uri.includes("cloudflarestream.com") || uri.includes("videodelivery.net")) {
    const match = uri.match(/(?:cloudflarestream\.com|videodelivery\.net)\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return `https://videodelivery.net/${match[1]}/thumbnails/thumbnail.jpg?time=1s&width=480`;
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
      shouldBlurContent,
      hasMultipleMedia,
      extraMediaCount,
      allowAutoplay = true,
      screenActive = true,
      onRevealContent,
      onMediaPress,
      onGalleryMediaPress,
      isPostDetail = false,
    },
    ref,
  ) {
    const [imageError, setImageError] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isVideoLoading, setIsVideoLoading] = useState(false);
    const [isVideoProcessing, setIsVideoProcessing] = useState(false);
    const globalMuted = useVideoMuteStore((s) => s.isMuted);
    const toggleMute = useVideoMuteStore((s) => s.toggleMute);
    const setMuted = useVideoMuteStore((s) => s.setMuted);
    const effectiveMuted = isPostDetail
      ? globalMuted
      : allowAutoplay
        ? (globalMuted || !isFocused)
        : globalMuted;
    const [mediaLoaded, setMediaLoaded] = useState(() => media?.uri ? MEDIA_LOADED_CACHE.has(media.uri) : false);
    const [mediaRetryKey, setMediaRetryKey] = useState(0);
    const { isConnected } = useNetworkState();
    const videoRef = useRef<Video | null>(null);
    const youtubeEmbedRef = useRef<YouTubeAutoplayEmbedRef | null>(null);
    const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const playRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pauseDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const aspectRatioLockedRef = useRef(false);
    const userInitiatedPlayRef = useRef(false);
    const prevShouldBlurRef = useRef(shouldBlurContent);
    const [feedTappedToPlay, setFeedTappedToPlay] = useState(false);
    const feedTapCooldownRef = useRef(false);

    const youtubeVideoId = media?.type === "youtube" ? (extractYouTubeVideoId(media.uri) ?? "") : "";
    const shouldLazyMountYouTube = Platform.OS === "android" && !isPostDetail;
    const videoThumbnailUri = media?.type === "video" ? getVideoThumbnailUri(media.uri) : "";
    const youtubeThumbnailUri = youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : "";
    const getPosition = useVideoPositionStore((s) => s.getPosition);
    const setPosition = useVideoPositionStore((s) => s.setPosition);
    const lastKnownYouTubeTimeRef = useRef(0);
    const hasRestoredPositionRef = useRef(false);

    const saveYouTubePositionSync = useCallback(() => {
      if (!youtubeVideoId) return;
      if (Platform.OS === "android") {
        const t = youtubeEmbedRef.current?.getLastKnownTime?.() ?? lastKnownYouTubeTimeRef.current;
        if (t > 2) setPosition(youtubeVideoId, t);
      } else {
        const t = lastKnownYouTubeTimeRef.current;
        if (t > 2) setPosition(youtubeVideoId, t);
      }
    }, [youtubeVideoId, setPosition]);

    const restoreYouTubePosition = useCallback(() => {
      if (Platform.OS !== "android") return;
      if (!youtubeVideoId || hasRestoredPositionRef.current) return;
      const saved = getPosition(youtubeVideoId);
      if (saved > 2) {
        hasRestoredPositionRef.current = true;
        setTimeout(() => {
          youtubeEmbedRef.current?.seekTo(saved);
          setTimeout(() => youtubeEmbedRef.current?.play(), 600);
        }, 600);
      }
    }, [youtubeVideoId, getPosition]);

    const handleYouTubeTimeUpdate = useCallback((seconds: number) => {
      lastKnownYouTubeTimeRef.current = seconds;
    }, []);

    useImperativeHandle(ref, () => ({
      pauseVideo: () => {
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
        }
        saveYouTubePositionSync();
        youtubeEmbedRef.current?.pause();
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
      },
    }));

    useEffect(() => {
      return () => {
        videoRef.current?.pauseAsync().catch(() => {});
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        if (playRetryRef.current) {
          clearInterval(playRetryRef.current);
        }
        if (pauseDelayRef.current) {
          clearTimeout(pauseDelayRef.current);
        }
      };
    }, []);

    const resolvedMediaUri = media?.uri;

    const resolvedMediaUriRef = useRef(resolvedMediaUri);
    useEffect(() => {
      const uriChanged = resolvedMediaUriRef.current !== resolvedMediaUri;
      resolvedMediaUriRef.current = resolvedMediaUri;
      if (uriChanged) {
        const wasLoaded = resolvedMediaUri ? MEDIA_LOADED_CACHE.has(resolvedMediaUri) : false;
        setMediaLoaded(wasLoaded);
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
    }, [resolvedMediaUri]);

    const cachedAspectRatio = resolvedMediaUri
      ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
      : undefined;
    const initialAspectRatio = cachedAspectRatio ?? getMediaAspectRatio(media);
    const [mediaAspectRatio, setMediaAspectRatio] = useState(initialAspectRatio);

    if (cachedAspectRatio && !aspectRatioLockedRef.current) {
      aspectRatioLockedRef.current = true;
    }

    const prevMediaUriRef = useRef(resolvedMediaUri);
    if (prevMediaUriRef.current !== resolvedMediaUri) {
      prevMediaUriRef.current = resolvedMediaUri;
      const newCached = resolvedMediaUri ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri) : undefined;
      if (newCached) {
        if (Math.abs(mediaAspectRatio - newCached) >= 0.01) {
          setMediaAspectRatio(newCached);
        }
        aspectRatioLockedRef.current = true;
      } else {
        const computed = getMediaAspectRatio(media);
        if (Math.abs(mediaAspectRatio - computed) >= 0.01) {
          setMediaAspectRatio(computed);
        }
        aspectRatioLockedRef.current = false;
      }
    }

    useEffect(() => {
      const isPlayable = media?.type === "video" || media?.type === "youtube";
      const canAutoPlayCurrentMedia =
        media?.type === "youtube"
          ? ((Platform.OS === "android" && allowAutoplay) || feedTappedToPlay)
          : (allowAutoplay || feedTappedToPlay);
      if (!isPlayable || shouldBlurContent) {
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        prevShouldBlurRef.current = shouldBlurContent;
        return;
      }

      const wasBlurred = prevShouldBlurRef.current;
      prevShouldBlurRef.current = shouldBlurContent;

      if (wasBlurred && !shouldBlurContent && screenActive && canAutoPlayCurrentMedia) {
        setIsVideoPlaying(true);
        videoRef.current?.playAsync().catch(() => {});
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
        userInitiatedPlayRef.current = false;
        videoRef.current?.pauseAsync().catch(() => {});
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
            userInitiatedPlayRef.current = false;
            videoRef.current?.pauseAsync().catch(() => {});
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

    useEffect(() => {
      if (videoRef.current && media?.type === "video") {
        videoRef.current.setStatusAsync({ isMuted: effectiveMuted }).catch(() => {});
      }
    }, [effectiveMuted, media?.type]);

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
        if (aspectRatioLockedRef.current) return;
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
        if (isPostDetail) return;
        if (!allowAutoplay && !isVideoPlaying && !feedTappedToPlay) {
          setFeedTappedToPlay(true);
          handleVideoToggle();
          return;
        }
        triggerHaptic("selection");
        onMediaPress?.();
      },
      [isPostDetail, allowAutoplay, isVideoPlaying, feedTappedToPlay, handleVideoToggle, onMediaPress],
    );

    const handleFeedYouTubeTap = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        if (isPostDetail) return;
        if (Platform.OS === "android" && !shouldAutoPlayYouTube && !isVideoPlaying && !feedTappedToPlay) {
          setFeedTappedToPlay(true);
          return;
        }
        triggerHaptic("selection");
        onMediaPress?.();
      },
      [isPostDetail, shouldAutoPlayYouTube, isVideoPlaying, feedTappedToPlay, onMediaPress],
    );

    const resolvedMediaUriForCacheRef = useRef(media?.uri);
    resolvedMediaUriForCacheRef.current = media?.uri;

    const handlePlaybackStatusUpdate = useCallback(
      (status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
          return;
        }
        if (status.isPlaying) {
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
            if (!newEffective) {
              await videoRef.current.pauseAsync();
              await videoRef.current.setStatusAsync({ isMuted: false });
              await videoRef.current.playAsync();
            } else {
              await videoRef.current.setStatusAsync({ isMuted: true });
            }
          } catch {}
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
        onMediaPress?.();
      },
      [shouldBlurContent, onRevealContent, onMediaPress],
    );

    // Don't hide cloudflarestream videos on error - they might be processing
    const isCloudflareVideo =
      media?.uri?.includes("cloudflarestream.com") ||
      media?.uri?.includes("videodelivery.net");
    const shouldHideOnError =
      imageError && !isCloudflareVideo && !isVideoProcessing;

    const wasOfflineRef = useRef(false);
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
    const calculatedHeight = containerWidth / mediaAspectRatio;
    const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;

    const mediaWrapperStyle = exceedsMaxHeight
      ? { height: MEDIA_MAX_HEIGHT }
      : { aspectRatio: mediaAspectRatio };

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
                <Text>
                  size="xs"
                  style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}
                >
                  Check your network and try again
                </Text>
              </View>
            )}
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
              {videoThumbnailUri && !mediaLoaded && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri)) ? (
                <Image
                  source={{ uri: videoThumbnailUri }}
                  style={[styles.media, { position: "absolute", zIndex: 0 }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={videoThumbnailUri}
                  onLoad={({ source }) => {
                    updateMediaAspectRatioFromSize(source?.width, source?.height);
                  }}
                />
              ) : null}
              <Video
                key={mediaRetryKey}
                ref={videoRef}
                source={mediaSource}
                style={styles.media}
                resizeMode={ResizeMode.COVER}
                shouldPlay={isVideoPlaying && screenActive}
                isLooping={true}
                isMuted={effectiveMuted}
                useNativeControls={false}
              onLoad={() => {
                  setMediaLoaded(true);
                  if (resolvedMediaUri) MEDIA_LOADED_CACHE.add(resolvedMediaUri);
                  videoRef.current?.setStatusAsync({ isMuted: effectiveMuted }).catch(() => {});
                }}
                onReadyForDisplay={(event) => {
                  const { width, height } = event.naturalSize ?? {};
                  updateMediaAspectRatioFromSize(width, height);
                  setMediaLoaded(true);
                  if (resolvedMediaUri) MEDIA_LOADED_CACHE.add(resolvedMediaUri);
                  // Video is ready to display - hide loading if user initiated
                  if (userInitiatedPlayRef.current) {
                    setIsVideoLoading(false);
                    userInitiatedPlayRef.current = false;
                  }
                  // Video loaded successfully - clear processing state
                  if (isVideoProcessing) {
                    setIsVideoProcessing(false);
                  }
                  videoRef.current?.setStatusAsync({ isMuted: effectiveMuted }).catch(() => {});
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
                  // For cloudflare stream videos, show processing state instead of hiding
                  const isCloudflare =
                    mediaSource.uri?.includes("cloudflarestream.com") ||
                    mediaSource.uri?.includes("videodelivery.net");
                  if (isCloudflare) {
                    setIsVideoProcessing(true);
                  } else {
                    setImageError(true);
                  }
                  setIsVideoLoading(false);
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
            !isVideoProcessing &&
            isPostDetail && (
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
            )}

          {/* Mute/Unmute button for videos */}
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

          {/* Video processing overlay for Cloudflare Stream */}
          {isVideoProcessing && isCloudflareVideo && isConnected && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text
                size="sm"
                weight="semibold"
                style={{ color: "#fff", marginTop: 8 }}
              >
                Video processing...
              </Text>
              <Text
                size="xs"
                style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}
              >
                This may take a few moments
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

          {/* Blur overlay with reveal button */}
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

          {/* Video badge - placed after blur so it's always visible */}
          {media.type === "video" && (
            <View style={styles.videoBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                VIDEO
              </Text>
            </View>
          )}

          {/* GIF badge - placed after blur so it's always visible */}
          {media.type === "gif" && (
            <View style={styles.gifBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                GIF
              </Text>
            </View>
          )}

          {/* Image badge - placed after blur so it's always visible */}
          {media.type === "image" && (
            <View style={styles.imageBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                IMG
              </Text>
            </View>
          )}
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
    borderWidth: 0.3,
    borderColor: theme.colors.border.subtle,
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
