import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
} from "react-native";
import { getVideoThumbnailUri, type ResolvedMedia } from "./post-card-utils";
import { useVideoMuteStore } from "@/src/stores";
import { markVideoFirstFrame } from "@/src/utils/video-ttff";
import {
  MEDIA_LOADED_CACHE,
  MEDIA_MAX_HEIGHT,
} from "./post-card-media-constants";
import {
  MediaBlurRevealOverlay,
  MediaOfflineOverlay,
  MediaProcessingOverlay,
  MediaTypeBadge,
} from "./post-card-media-overlays";
import { postMediaStyles as styles } from "./post-card-media-styles";
import {
  useMediaAspectRatio,
  useMediaFrameWidth,
  useMediaPressTransition,
} from "./post-card-media-shared";
import { usePostCardVideoPlayback } from "./use-post-card-video-playback";
import { usePostCardVideoListeners } from "./use-post-card-video-listeners";
import { usePostCardVideoHealth } from "./use-post-card-video-health";
import { getMediaImagePolicy, getMediaImageSource } from "./media-image-policy";
import { VideoUnavailableOverlay } from "./video-unavailable-overlay";

export type PostCardVideoRef = {
  pauseVideo: () => void;
};

type PostCardVideoProps = {
  media: ResolvedMedia;
  isVisible: boolean;
  isFocused: boolean;
  isNearVisible?: boolean;
  isConnected: boolean;
  shouldPrimeOptimisticVideo?: boolean;
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
  forceVideoProcessing?: boolean;
  processingMediaUri?: string;
  onVideoProcessingComplete?: () => void;
};

/**
 * Self-contained native-video surface for a post card. Owns its player
 * (creation, feed->detail handoff, buffers), play/pause orchestration,
 * position persistence, failure recovery, and all video chrome.
 */
export const PostCardVideo = memo(
  forwardRef<PostCardVideoRef, PostCardVideoProps>(function PostCardVideo(
    {
      media,
      isVisible,
      isFocused,
      isNearVisible,
      isConnected,
      shouldPrimeOptimisticVideo = false,
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
      forceVideoProcessing = false,
      processingMediaUri,
      onVideoProcessingComplete,
    },
    ref,
  ) {
    const resolvedMediaUri = media.uri;
    const globalMuted = useVideoMuteStore((s) => s.isMuted);
    const toggleMute = useVideoMuteStore((s) => s.toggleMute);

    const playback = usePostCardVideoPlayback({
      media,
      isVisible,
      isFocused,
      isNearVisible,
      screenActive,
      shouldBlurContent,
      allowAutoplay,
      isPostDetail,
      videoSyncScope,
      postId,
      shouldPrimeOptimisticVideo,
    });
    const {
      videoPlayer,
      isVideoPlaying,
      setIsVideoPlaying,
      isVideoLoading,
      setIsVideoLoading,
      videoReadyForDisplay,
      setVideoReadyForDisplay,
      showVideoPrepSpinner,
      feedTappedToPlay,
      setFeedTappedToPlay,
      setRetainPlayerForDetail,
      shouldMountNativeVideo,
      videoPositionKey,
      currentVideoPositionRef,
      setPosition,
      saveVideoPosition,
      saveVideoPositionFresh,
      stopNativeVideoPlayback,
      userInitiatedPlayRef,
    } = playback;

    const { effectiveAspectRatio, updateMediaAspectRatioFromSize } =
      useMediaAspectRatio(media);
    const { containerWidth, onMediaLayout } = useMediaFrameWidth();
    const { mediaFrameRef, runWithMediaTransition } = useMediaPressTransition({
      isPostDetail,
      postId,
    });

    usePostCardVideoListeners({
      playback,
      resolvedMediaUri,
      isPostDetail,
      updateMediaAspectRatioFromSize,
    });

    const health = usePostCardVideoHealth({
      media,
      adoptedLease: playback.adoptedLease,
      enabled: playback.shouldPrepareNativeVideo && screenActive && isConnected && !shouldBlurContent,
      shouldPlay: playback.shouldPlayNativeVideo,
      forceVideoProcessing,
      processingMediaUri,
      onVideoProcessingComplete,
      postId,
      videoPlayer,
    });
    const {
      isRedgifsVideo,
      showVideoProcessing,
      videoError,
      handleFirstFrameHealth,
    } = health;
    const mediaLoaded = health.phase === "playable";

    useImperativeHandle(ref, () => ({
      pauseVideo: async () => {
        await saveVideoPositionFresh();
        await stopNativeVideoPlayback();
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
      },
    }));

    const handleVideoToggle = useCallback(() => {
      if (shouldBlurContent) {
        onRevealContent?.();
        return;
      }

      if (videoPlayer.playing) {
        videoPlayer.pause();
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        return;
      }

      userInitiatedPlayRef.current = true;
      setIsVideoLoading(true);
      if (
        videoPlayer.duration > 0 &&
        videoPlayer.currentTime >= videoPlayer.duration - 0.1
      ) {
        videoPlayer.replay();
      } else {
        videoPlayer.play();
      }
      setIsVideoPlaying(true);
    }, [onRevealContent, shouldBlurContent, videoPlayer, setIsVideoLoading, setIsVideoPlaying, userInitiatedPlayRef]);

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
        // Keep the buffered player alive under the push and record playback
        // state for the destination's transition overlay.
        setRetainPlayerForDetail(true);
        const positionSeconds = Math.max(
          videoPlayer.currentTime,
          currentVideoPositionRef.current,
        );
        if (videoPositionKey && positionSeconds > 0.5) {
          setPosition(videoPositionKey, positionSeconds);
        }
        runWithMediaTransition(
          media,
          () => {
            saveVideoPositionFresh();
            onMediaPress?.();
          },
          { positionSeconds, wasPlaying: videoPlayer.playing },
        );
      },
      [disabled, isPostDetail, shouldBlurContent, onRevealContent, allowAutoplay, isVideoPlaying, feedTappedToPlay, handleVideoToggle, setFeedTappedToPlay, setRetainPlayerForDetail, videoPlayer, currentVideoPositionRef, videoPositionKey, setPosition, runWithMediaTransition, media, onMediaPress, saveVideoPositionFresh],
    );

    const handleDetailMediaPress = useCallback(
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
        const newGlobalMuted = !globalMuted;
        toggleMute();
        const newEffective = isPostDetail
          ? newGlobalMuted
          : allowAutoplay
            ? (newGlobalMuted || !playback.isFocused)
            : newGlobalMuted;
        videoPlayer.muted = newEffective || !videoReadyForDisplay;
      },
      [globalMuted, toggleMute, isPostDetail, allowAutoplay, playback.isFocused, videoReadyForDisplay, videoPlayer],
    );

    const calculatedHeight = containerWidth / effectiveAspectRatio;
    const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
    const mediaWrapperStyle = exceedsMaxHeight
      ? { height: MEDIA_MAX_HEIGHT }
      : { aspectRatio: effectiveAspectRatio };

    const videoThumbnailUri = getVideoThumbnailUri(media.uri, media.posterUri);
    const videoThumbnailPolicy = getMediaImagePolicy({
      uri: videoThumbnailUri,
      surface: isPostDetail ? "detail" : "feed",
      mediaType: "poster",
      contentFit: "contain",
      displayWidth: containerWidth,
      intrinsicWidth: media.width,
      intrinsicHeight: media.height,
      visible: isVisible,
    });

    const loadedCacheHit = !!(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri));
    const showSpinnerOverlay =
      (isVideoLoading && !loadedCacheHit) ||
      (isVideoPlaying && !mediaLoaded && !loadedCacheHit);

    return (
      <View style={styles.mediaContainer}>
        <View ref={mediaFrameRef} onLayout={onMediaLayout} style={[styles.mediaWrapper, mediaWrapperStyle]}>
          <Pressable
            onPress={isPostDetail ? handleDetailMediaPress : handleFeedVideoTap}
            style={styles.media}
          >
            {videoThumbnailUri && (!mediaLoaded || !shouldMountNativeVideo) ? (
              <>
                <Image
                  source={getMediaImageSource(videoThumbnailPolicy)}
                  style={[styles.media, { position: "absolute", zIndex: 1 }]}
                  contentFit={videoThumbnailPolicy.contentFit}
                  cachePolicy={videoThumbnailPolicy.cachePolicy}
                  recyclingKey={videoThumbnailPolicy.recyclingKey}
                  allowDownscaling={videoThumbnailPolicy.allowDownscaling}
                  enforceEarlyResizing={videoThumbnailPolicy.enforceEarlyResizing}
                  priority={videoThumbnailPolicy.priority}
                />
                {showVideoPrepSpinner && !videoError ? (
                  <View style={styles.playOverlay} pointerEvents="none">
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
            {shouldMountNativeVideo && !playback.controlledElsewhere ? (
              <VideoView
                key={`${resolvedMediaUri}:${health.revision}`}
                player={videoPlayer}
                style={styles.media}
                contentFit="contain"
                nativeControls={false}
                fullscreenOptions={{ enable: false }}
                allowsPictureInPicture={false}
                surfaceType={Platform.OS === "android" ? "textureView" : undefined}
                onFirstFrameRender={() => {
                  if (!handleFirstFrameHealth()) return;
                  if (resolvedMediaUri) {
                    markVideoFirstFrame(resolvedMediaUri, isPostDetail ? "detail" : "feed");
                  }
                  setVideoReadyForDisplay(true);
                  if (resolvedMediaUri) {
                    MEDIA_LOADED_CACHE.add(resolvedMediaUri);
                  }
                  if (userInitiatedPlayRef.current) {
                    setIsVideoLoading(false);
                    userInitiatedPlayRef.current = false;
                  }
                }}
              />
            ) : null}
          </Pressable>

          {!mediaLoaded && playback.shouldPlayNativeVideo && !loadedCacheHit && !shouldBlurContent && isConnected && !showVideoProcessing && !videoError && (
            <View style={[styles.skeletonOverlay]}>
              <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
            </View>
          )}

          {!shouldBlurContent && !showVideoProcessing && !videoError && (
            <View style={styles.playOverlay}>
              {isPostDetail ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isVideoPlaying ? "Pause video" : "Play video"}
                    onPress={handleVideoPress}
                    style={styles.videoTapArea}
                  />
                  {showSpinnerOverlay ? (
                    <View style={styles.loadingContainer} pointerEvents="none">
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
                    accessibilityRole="button"
                    accessibilityLabel={isVideoPlaying ? "Pause video" : "Play video"}
                    onPress={handleFeedVideoTap}
                    style={styles.videoTapArea}
                  />
                  {showSpinnerOverlay ? (
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

          {!shouldBlurContent && !showVideoProcessing && !videoError && isPostDetail && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open fullscreen video"
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

          {!shouldBlurContent && !showVideoProcessing && !videoError && (
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

          <MediaProcessingOverlay
            visible={Boolean(isConnected && showVideoProcessing)}
            isRedgifsVideo={Boolean(isRedgifsVideo)}
          />
          <VideoUnavailableOverlay visible={videoError && !shouldBlurContent} onRetry={health.retry} />

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

// Re-export for surfaces that check hosted-stream readiness.
export { HOSTED_VIDEO_READY_CACHE } from "./use-post-card-video-health";
// Silence unused import warning for isHostedStreamVideo (derived in health).
void ((): unknown => null);
