import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
} from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { extractYouTubeVideoId, type ResolvedMedia } from "./post-card-utils";
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
import {
  MEDIA_LOADED_CACHE,
  MEDIA_MAX_HEIGHT,
} from "./post-card-media-constants";
import {
  MediaBlurRevealOverlay,
  MediaOfflineOverlay,
  MediaTypeBadge,
} from "./post-card-media-overlays";
import { postMediaStyles as styles } from "./post-card-media-styles";
import {
  useMediaAspectRatio,
  useMediaFrameWidth,
  useMediaLoadedState,
  useMediaPressTransition,
} from "./post-card-media-shared";
import { getMediaImagePolicy, getMediaImageSource } from "./media-image-policy";

export type PostCardYouTubeRef = {
  pauseVideo: () => void;
};

type PostCardYouTubeProps = {
  media: ResolvedMedia;
  isVisible: boolean;
  isFocused: boolean;
  isConnected: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  allowAutoplay?: boolean;
  screenActive?: boolean;
  disabled?: boolean;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  isPostDetail?: boolean;
  videoSyncScope?: string;
  postId?: string;
};

/**
 * Self-contained YouTube embed surface for a post card: platform-specific
 * embed selection (Android autoplay embed vs iframe player), position
 * save/restore, retry-until-playing on Android, and all YouTube chrome.
 */
export const PostCardYouTube = memo(
  forwardRef<PostCardYouTubeRef, PostCardYouTubeProps>(function PostCardYouTube(
    {
      media,
      isVisible,
      isFocused,
      isConnected,
      shouldBlurContent,
      hasMultipleMedia,
      extraMediaCount,
      allowAutoplay = true,
      screenActive = true,
      disabled = false,
      onRevealContent,
      onMediaPress,
      isPostDetail = false,
      videoSyncScope,
      postId,
    },
    ref,
  ) {
    const resolvedMediaUri = media.uri;
    const isFeedScrolling = useIsFeedScrolling(
      !isPostDetail ? videoSyncScope : undefined,
    );
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isVideoLoading, setIsVideoLoading] = useState(false);
    const [feedTappedToPlay, setFeedTappedToPlay] = useState(false);
    const globalMuted = useVideoMuteStore((s) => s.isMuted);
    const toggleMute = useVideoMuteStore((s) => s.toggleMute);
    const effectiveMuted = isPostDetail
      ? globalMuted
      : allowAutoplay
        ? (globalMuted || !isFocused)
        : globalMuted;

    const youtubeEmbedRef = useRef<YouTubeAutoplayEmbedRef | null>(null);
    const playRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastKnownYouTubeTimeRef = useRef(0);
    const hasRestoredPositionRef = useRef(false);
    const prevShouldBlurRef = useRef(shouldBlurContent);

    const youtubeVideoId = extractYouTubeVideoId(media.uri) ?? "";
    const youtubePositionKey = youtubeVideoId
      ? buildVideoPositionKey(youtubeVideoId, videoSyncScope)
      : "";
    const shouldLazyMountYouTube = Platform.OS === "android" && !isPostDetail;
    const youtubeThumbnailUri = youtubeVideoId
      ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`
      : "";
    const getPosition = useVideoPositionStore((s) => s.getPosition);
    const setPosition = useVideoPositionStore((s) => s.setPosition);

    const mediaWasCached = !!(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri));
    const shouldDeferHeavyMedia =
      Platform.OS === "android" &&
      !isPostDetail &&
      !!videoSyncScope &&
      isFeedScrolling &&
      !isFocused &&
      !feedTappedToPlay &&
      !mediaWasCached;

    const { mediaLoaded, setMediaLoaded } = useMediaLoadedState(
      resolvedMediaUri,
      () => setIsVideoLoading(false),
    );
    const { effectiveAspectRatio } = useMediaAspectRatio(media);
    const { containerWidth, onMediaLayout } = useMediaFrameWidth();
    const { mediaFrameRef, runWithMediaTransition } = useMediaPressTransition({
      isPostDetail,
      postId,
    });

    const shouldAutoPlayYouTube =
      Platform.OS === "android" && allowAutoplay && (isPostDetail || isFocused);
    const shouldUseAndroidYouTubeEmbed = Platform.OS === "android";
    const shouldPlayYouTube =
      isVideoPlaying && screenActive && !shouldBlurContent;

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

    // Viewability/blur/screen-state driven play/pause orchestration.
    useEffect(() => {
      const canAutoPlayFeedMedia = allowAutoplay && (isPostDetail || isFocused);
      const canAutoPlayCurrentMedia =
        (Platform.OS === "android" && canAutoPlayFeedMedia) || feedTappedToPlay;
      if (shouldBlurContent) {
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
        setIsVideoPlaying(true);
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
      } else if (!screenActive) {
        saveYouTubePositionSync();
        if (playRetryRef.current) {
          clearInterval(playRetryRef.current);
          playRetryRef.current = null;
        }
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
      } else if (!isVisible || (!isPostDetail && !canAutoPlayCurrentMedia)) {
        saveYouTubePositionSync();
        if (playRetryRef.current) {
          clearInterval(playRetryRef.current);
          playRetryRef.current = null;
        }
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
      }
    }, [
      shouldBlurContent,
      isVisible,
      allowAutoplay,
      screenActive,
      resolvedMediaUri,
      feedTappedToPlay,
      isPostDetail,
      isFocused,
      saveYouTubePositionSync,
    ]);

    useEffect(() => {
      if (!isPostDetail && !isVisible && feedTappedToPlay) {
        setFeedTappedToPlay(false);
      }
    }, [isPostDetail, isVisible, feedTappedToPlay]);

    useEffect(
      () => () => {
        if (playRetryRef.current) {
          clearInterval(playRetryRef.current);
        }
      },
      [],
    );

    useImperativeHandle(ref, () => ({
      pauseVideo: () => {
        saveYouTubePositionSync();
        youtubeEmbedRef.current?.pause();
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
      },
    }));

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

    const handleMuteToggle = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        triggerHaptic("light");
        const newGlobalMuted = !globalMuted;
        toggleMute();
        if (shouldUseAndroidYouTubeEmbed) {
          const newEffective = isPostDetail
            ? newGlobalMuted
            : allowAutoplay
              ? (newGlobalMuted || !isFocused)
              : newGlobalMuted;
          youtubeEmbedRef.current?.setMuted(newEffective);
        }
      },
      [globalMuted, toggleMute, shouldUseAndroidYouTubeEmbed, isPostDetail, allowAutoplay, isFocused],
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

    const calculatedHeight = containerWidth / effectiveAspectRatio;
    const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
    const mediaWrapperStyle = exceedsMaxHeight
      ? { height: MEDIA_MAX_HEIGHT }
      : { aspectRatio: effectiveAspectRatio };

    const youtubeThumbnailPolicy = getMediaImagePolicy({
      uri: youtubeThumbnailUri,
      surface: isPostDetail ? "detail" : "feed",
      mediaType: "poster",
      displayWidth: containerWidth,
      intrinsicWidth: media.width,
      intrinsicHeight: media.height,
      visible: isVisible,
    });

    return (
      <View style={styles.mediaContainer}>
        <View ref={mediaFrameRef} onLayout={onMediaLayout} style={[styles.mediaWrapper, mediaWrapperStyle]}>
          {shouldLazyMountYouTube && (!isVisible || shouldDeferHeavyMedia) ? (
            <Pressable onPress={handleFeedYouTubeTap} style={styles.media}>
              <Image
                source={getMediaImageSource(youtubeThumbnailPolicy)}
                style={styles.media}
                contentFit={youtubeThumbnailPolicy.contentFit}
                cachePolicy={youtubeThumbnailPolicy.cachePolicy}
                recyclingKey={youtubeThumbnailPolicy.recyclingKey}
                allowDownscaling={youtubeThumbnailPolicy.allowDownscaling}
                enforceEarlyResizing={youtubeThumbnailPolicy.enforceEarlyResizing}
                priority={youtubeThumbnailPolicy.priority}
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
              videoId={youtubeVideoId}
              play={shouldPlayYouTube}
              muted={effectiveMuted}
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
              videoId={youtubeVideoId}
              play={shouldPlayYouTube}
              mute={effectiveMuted}
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Rewind 10 seconds"
                    onPress={handleYouTubeSeekBack}
                    style={styles.youtubeControlButton}
                    hitSlop={8}
                  >
                    <Ionicons name="play-back" size={18} color="#fff" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isVideoPlaying ? "Pause video" : "Play video"}
                    onPress={handleYouTubeTogglePlay}
                    style={styles.youtubeControlButton}
                    hitSlop={8}
                  >
                    <Ionicons name={isVideoPlaying ? "pause" : "play"} size={18} color="#fff" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fast-forward 10 seconds"
                    onPress={handleYouTubeSeekForward}
                    style={styles.youtubeControlButton}
                    hitSlop={8}
                  >
                    <Ionicons name="play-forward" size={18} color="#fff" />
                  </Pressable>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open fullscreen video"
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

          {isVideoLoading && !shouldBlurContent && (
            <View style={styles.playOverlay} pointerEvents="none">
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            </View>
          )}

          {!shouldBlurContent && Platform.OS !== "ios" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={globalMuted ? "Unmute video" : "Mute video"}
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

          {Platform.OS === "android" && !shouldBlurContent && (
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
