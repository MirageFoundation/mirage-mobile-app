import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ScreenOrientation from "expo-screen-orientation";
import { VideoView } from "expo-video";
import * as Sentry from "@sentry/react-native";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ResolvedMedia } from "./post-card-utils";

import { Text } from "@/src/components/ui/primitives";
import { useAppState } from "@/src/hooks";
import { useScreenOrientation } from "@/src/hooks/use-screen-orientation";
import { useVideoPlayerController } from "@/src/hooks/use-video-player-controller";
import {
  buildVideoPositionKey,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import { canonicalVideoAssetId } from "@/src/utils/video-asset-id";
import {
  adoptHandoffPlayer,
  releaseHandoffPlayer,
  type VideoPlayerLease,
} from "@/src/utils/video-player-handoff";
import { PreviewVideoItem } from "./media-preview-video-item";
import { PreviewYouTubeItem } from "./media-preview-youtube-item";
import { usePreviewZoomGesture } from "./use-preview-zoom-gesture";
import { StyleSheet } from "react-native-unistyles";
import { getVideoSourceUri, isVideoPlayerControlledElsewhere } from "@/src/utils/video-player-handoff";
import { useVideoSourceRecovery } from "./use-video-source-recovery";
import { VideoUnavailableOverlay } from "./video-unavailable-overlay";

type MediaPreviewModalProps = {
  visible: boolean;
  media: ResolvedMedia | null;
  mediaList?: ResolvedMedia[];
  initialIndex?: number;
  videoSyncScope?: string;
  onClose: () => void;
};

/**
 * Fullscreen media preview: orientation-unlocked modal hosting either a
 * paged gallery (items own their players — `PreviewVideoItem`,
 * `PreviewYouTubeItem`) or a single media surface with pinch-zoom for
 * images and an owned player for video.
 */
export const MediaPreviewModal = memo(function MediaPreviewModal({
  visible,
  media,
  mediaList,
  initialIndex = 0,
  videoSyncScope,
  onClose,
}: MediaPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { screenWidth, screenHeight } = useScreenOrientation();
  const { currentState } = useAppState();
  const mediaSurfaceActive = visible && currentState === "active";

  useEffect(() => {
    if (visible) {
      console.log("[MediaPreview] Setting orientation to DEFAULT (all but upside down)");
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT)
        .then(() => console.log("[MediaPreview] Orientation unlocked for rotation"))
        .catch((e) => {
          Sentry.addBreadcrumb({ category: "media-preview", message: "Orientation lockAsync failed", data: { error: String(e) }, level: "warning" });
        });
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible]);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const isMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const [isLoading, setIsLoading] = useState(true);
  const currentVideoPositionRef = useRef(0);
  const hasRestoredVideoRef = useRef(false);
  const videoPositionKey = media?.uri
    ? buildVideoPositionKey(media.uri, videoSyncScope)
    : "";
  const hasGallery = !!(mediaList && mediaList.length > 1);

  // Adopt the underlying screen's already-buffered player (the feed/detail
  // card stays mounted beneath the modal), so fullscreen opens continue
  // instantly instead of re-streaming. Adopted players are already at the
  // live position, so the saved-position restore is skipped.
  const isSingleVideo = media?.type === "video" && !hasGallery;
  const singleVideoUri = isSingleVideo ? media.uri : null;
  const videoHandoffKey =
    singleVideoUri && !singleVideoUri.startsWith("file://")
      ? canonicalVideoAssetId(singleVideoUri)
      : null;
  const [adoptedLease, setAdoptedLease] = useState<VideoPlayerLease | null>(null);
  const adoptedPlayer = adoptedLease?.player ?? null;
  useEffect(() => {
    if (!visible || !videoHandoffKey || !singleVideoUri) return;
    const lease = adoptHandoffPlayer(videoHandoffKey, singleVideoUri);
    if (!lease) return;
    hasRestoredVideoRef.current = true;
    setAdoptedLease(lease);
    return () => {
      setAdoptedLease(null);
      releaseHandoffPlayer(lease);
    };
  }, [visible, videoHandoffKey, singleVideoUri]);
  const controllerPlayer = useVideoPlayerController(
    isSingleVideo && visible && !adoptedLease ? media.uri : null,
    {
      loop: true,
      muted: isMuted,
      shouldPlay:
        isSingleVideo &&
        !adoptedLease &&
        isVideoPlaying &&
        mediaSurfaceActive,
      timeUpdateInterval: 0.1,
    },
  );
  const videoPlayer = adoptedPlayer ?? controllerPlayer;
  const recovery = useVideoSourceRecovery({ uri: singleVideoUri ?? "", player: videoPlayer, lease: adoptedLease, enabled: isSingleVideo && mediaSurfaceActive, shouldPlay: isVideoPlaying && mediaSurfaceActive });
  const videoLoading = isVideoPlaying && (recovery.phase === "loading" || recovery.phase === "recovering");
  const { acceptsEvent } = recovery;

  // An adopted player bypasses the controller's option effects; as the top
  // lease holder the modal applies its settings directly.
  useEffect(() => {
    if (!adoptedPlayer || isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      adoptedPlayer.loop = true;
      adoptedPlayer.timeUpdateEventInterval = 0.1;
    } catch {
      // Native player was released underneath us.
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease]);
  useEffect(() => {
    if (!adoptedPlayer || isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      adoptedPlayer.muted = isMuted;
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, isMuted]);
  useEffect(() => {
    if (!adoptedPlayer || isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      if (isVideoPlaying && mediaSurfaceActive) {
        if (adoptedPlayer.status === "readyToPlay") {
          const position = adoptedPlayer.currentTime;
          adoptedPlayer.currentTime = position;
        }
        adoptedPlayer.play();
      } else {
        adoptedPlayer.pause();
      }
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, isVideoPlaying, mediaSurfaceActive]);

  const [activeGalleryIndex, setActiveGalleryIndex] = useState(initialIndex);
  const galleryListRef = useRef<FlatList>(null);

  const { composedGesture, animatedStyle, resetTransforms } = usePreviewZoomGesture(
    screenWidth,
    screenHeight,
  );

  const handleClose = useCallback(() => {
    if (!hasGallery && media?.type === "video" && videoPositionKey && currentVideoPositionRef.current > 0.5) {
      useVideoPositionStore.getState().setPosition(videoPositionKey, currentVideoPositionRef.current);
    }
    resetTransforms();
    setIsVideoPlaying(false);
    setIsLoading(true);
    hasRestoredVideoRef.current = false;
    onClose();
  }, [hasGallery, onClose, resetTransforms, media, videoPositionKey]);

  useEffect(() => {
    if (!visible) {
      setIsVideoPlaying(false);
    } else {
      setIsVideoPlaying(true);
    }
  }, [visible]);

  useEffect(() => {
    const restorePosition = (sourceUri?: string | null) => {
      if (!acceptsEvent(sourceUri) || hasGallery || hasRestoredVideoRef.current || !media?.uri) return;
      const saved = useVideoPositionStore.getState().getPosition(videoPositionKey);
      if (saved > 0.5) {
        hasRestoredVideoRef.current = true;
        videoPlayer.currentTime = saved;
      }
    };
    const timeSubscription = videoPlayer.addListener("timeUpdate", ({ currentTime }) => {
      if (!acceptsEvent()) return;
      currentVideoPositionRef.current = currentTime;
    });
    const statusSubscription = videoPlayer.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") {
        restorePosition();
      }
    });
    const playingSubscription = videoPlayer.addListener("playingChange", ({ isPlaying }) => {
      if (acceptsEvent() && mediaSurfaceActive && !hasGallery && isPlaying) {
        setIsVideoPlaying(true);
      }
    });
    const sourceSubscription = videoPlayer.addListener("sourceLoad", ({ videoSource }) => {
      if (getVideoSourceUri(videoSource) !== media?.uri) return;
      restorePosition(getVideoSourceUri(videoSource));
    });
    if (!hasGallery && videoPlayer.status === "readyToPlay") {
      restorePosition();
    }

    return () => {
      timeSubscription.remove();
      statusSubscription.remove();
      playingSubscription.remove();
      sourceSubscription.remove();
    };
  }, [hasGallery, media?.uri, mediaSurfaceActive, videoPlayer, videoPositionKey, acceptsEvent]);

  const handleVideoToggle = useCallback(() => {
    setIsVideoPlaying((playing) => !playing);
  }, []);

  const handleMuteToggle = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  if (!media && !hasGallery) return null;

  if (hasGallery) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
        statusBarTranslucent
        supportedOrientations={["portrait", "landscape"]}
      >
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close media preview"
            style={[styles.closeButton, { top: insets.top + 10 }]}
            onPress={handleClose}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <View style={styles.closeButtonInner}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </Pressable>

          <FlatList
            ref={galleryListRef}
            data={mediaList}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
              setActiveGalleryIndex(idx);
            }}
            keyExtractor={(item, index) => `${item.uri}-${index}`}
            renderItem={({ item, index }) =>
              item.type === "video" ? (
                <PreviewVideoItem
                  item={item}
                  width={screenWidth}
                  height={screenHeight}
                  isActive={index === activeGalleryIndex && mediaSurfaceActive}
                  shouldPrepare={
                    mediaSurfaceActive && Math.abs(index - activeGalleryIndex) <= 1
                  }
                  videoSyncScope={videoSyncScope}
                />
              ) : item.type === "youtube" ? (
                <PreviewYouTubeItem item={item} width={screenWidth} height={screenHeight} isActive={index === activeGalleryIndex && mediaSurfaceActive} videoSyncScope={videoSyncScope} />
              ) : (
                <View style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }]}>
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.fullMedia}
                    contentFit="contain"
                    recyclingKey={item.uri}
                  />
                </View>
              )
            }
          />

          <View style={[styles.pageIndicator, { bottom: insets.bottom + 20 }]}>
            <Text style={styles.pageIndicatorText}>
              {activeGalleryIndex + 1} / {mediaList!.length}
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  const isVideo = media!.type === "video";
  const isYouTube = media!.type === "youtube";
  const isGif = media!.type === "gif";
  const isImage = media!.type === "image";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close media preview"
            style={[styles.closeButton, { top: insets.top + 10 }]}
            onPress={handleClose}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <View style={styles.closeButtonInner}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </Pressable>

          {isImage && (
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }, animatedStyle]}>
                <Image
                  source={{ uri: media!.uri }}
                  style={styles.fullMedia}
                  contentFit="contain"
                  onLoad={() => setIsLoading(false)}
                />
              </Animated.View>
            </GestureDetector>
          )}

          {isGif && (
            <View style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }]}>
              <Image
                source={{ uri: media!.uri }}
                style={styles.fullMedia}
                contentFit="contain"
                onLoad={() => setIsLoading(false)}
              />
            </View>
          )}

          {isVideo && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isVideoPlaying ? "Pause video" : "Play video"}
              style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }]}
              onPress={handleVideoToggle}
            >
              <VideoView
                key={`${singleVideoUri}:${recovery.revision}`}
                player={videoPlayer}
                style={styles.fullMedia}
                contentFit="contain"
                nativeControls={false}
                fullscreenOptions={{ enable: false }}
                allowsPictureInPicture={false}
                surfaceType={Platform.OS === "android" ? "textureView" : undefined}
                onFirstFrameRender={recovery.firstFrame}
              />
              {!isVideoPlaying && !videoLoading && recovery.phase !== "terminal" && (
                <View style={styles.playOverlay}>
                  <View style={styles.playButton}>
                    <Ionicons name="play" size={40} color="#fff" />
                  </View>
                </View>
              )}
              <VideoUnavailableOverlay visible={recovery.phase === "terminal"} onRetry={recovery.retry} />
            </Pressable>
          )}

          {isYouTube && (
            <PreviewYouTubeItem item={media!} width={screenWidth} height={screenHeight} isActive={mediaSurfaceActive} videoSyncScope={videoSyncScope} />
          )}

          {!isYouTube && (isVideo ? videoLoading : isLoading) && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {isVideo && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isMuted ? "Unmute video" : "Mute video"}
              style={[styles.muteButton, { bottom: insets.bottom + 10 }]}
              onPress={handleMuteToggle}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.controlButtonInner}>
                <Ionicons
                  name={isMuted ? "volume-mute" : "volume-high"}
                  size={20}
                  color="#fff"
                />
              </View>
            </Pressable>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create((theme) => ({
  gestureRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 100,
  },
  closeButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullMedia: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    right: 16,
    zIndex: 100,
  },
  controlButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageIndicator: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  pageIndicatorText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
}));
