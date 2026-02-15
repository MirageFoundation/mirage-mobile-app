import { Ionicons } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import type { ResolvedMedia } from "./post-card-utils";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

import { Text } from "@/src/components/ui/primitives";
import { useVideoMuteStore } from "@/src/stores";

const PreviewVideoItem = memo(function PreviewVideoItem({
  item,
  width,
  isActive,
}: {
  item: ResolvedMedia;
  width: number;
  isActive: boolean;
}) {
  const ref = useRef<Video>(null);
  const [playing, setPlaying] = useState(true);
  const muted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);

  useEffect(() => {
    if (!isActive) {
      ref.current?.pauseAsync().catch(() => {});
    }
  }, [isActive]);

  const handleTogglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const handleToggleMute = useCallback(async () => {
    const newMuted = !muted;
    toggleMute();
    try {
      if (ref.current) {
        if (!newMuted) {
          await ref.current.pauseAsync();
          await ref.current.setStatusAsync({ isMuted: false });
          await ref.current.playAsync();
        } else {
          await ref.current.setStatusAsync({ isMuted: true });
        }
      }
    } catch {}
  }, [muted, toggleMute]);

  return (
    <View style={{ width, height: SCREEN_HEIGHT, justifyContent: "center", alignItems: "center" }}>
      <Pressable onPress={handleTogglePlay} style={{ width, height: SCREEN_HEIGHT }}>
        <Video
          ref={ref}
          source={{ uri: item.uri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={playing && isActive}
          isLooping
          isMuted={muted}
          useNativeControls={false}
        />
        {!playing && (
          <View style={previewVideoStyles.playOverlay}>
            <View style={previewVideoStyles.playButton}>
              <Ionicons name="play" size={40} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={handleToggleMute}
        style={previewVideoStyles.muteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={previewVideoStyles.muteButtonInner}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
});

const previewVideoStyles = StyleSheet.create({
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
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
    bottom: 80,
    right: 20,
  },
  muteButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});

type MediaPreviewModalProps = {
  visible: boolean;
  media: ResolvedMedia | null;
  mediaList?: ResolvedMedia[];
  initialIndex?: number;
  onClose: () => void;
};

export const MediaPreviewModal = memo(function MediaPreviewModal({
  visible,
  media,
  mediaList,
  initialIndex = 0,
  onClose,
}: MediaPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const isMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const [isLoading, setIsLoading] = useState(true);

  const [activeGalleryIndex, setActiveGalleryIndex] = useState(initialIndex);
  const galleryListRef = useRef<FlatList>(null);
  const hasGallery = mediaList && mediaList.length > 1;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransforms = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const handleClose = useCallback(() => {
    videoRef.current?.pauseAsync().catch(() => {});
    resetTransforms();
    setIsVideoPlaying(false);
    setIsLoading(true);
    onClose();
  }, [onClose, resetTransforms]);

  useEffect(() => {
    if (!visible) {
      videoRef.current?.pauseAsync().catch(() => {});
      setIsVideoPlaying(false);
    } else {
      setIsVideoPlaying(true);
    }
  }, [visible]);

  const handleVideoToggle = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await videoRef.current.pauseAsync();
        setIsVideoPlaying(false);
      } else {
        if (status.didJustFinish) {
          await videoRef.current.replayAsync();
        } else {
          await videoRef.current.playAsync();
        }
        setIsVideoPlaying(true);
      }
    } catch {}
  }, []);

  const handleMuteToggle = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.isPlaying && !status.isBuffering) {
      setIsLoading(false);
    }
  }, []);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withTiming(4);
        savedScale.value = 4;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!media && !hasGallery) return null;

  if (hasGallery) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <View style={styles.container}>
          <Pressable
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
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActiveGalleryIndex(idx);
            }}
            keyExtractor={(item, index) => `${item.uri}-${index}`}
            renderItem={({ item, index }) =>
              item.type === "video" ? (
                <PreviewVideoItem item={item} width={SCREEN_WIDTH} isActive={index === activeGalleryIndex} />
              ) : (
                <View style={styles.mediaContainer}>
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.fullMedia}
                    contentFit="contain"
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
  const isGif = media!.type === "gif";
  const isImage = media!.type === "image";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.container}>
          <Pressable
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
              <Animated.View style={[styles.mediaContainer, animatedStyle]}>
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
            <View style={styles.mediaContainer}>
              <Image
                source={{ uri: media!.uri }}
                style={styles.fullMedia}
                contentFit="contain"
                onLoad={() => setIsLoading(false)}
              />
            </View>
          )}

          {isVideo && (
            <Pressable style={styles.mediaContainer} onPress={handleVideoToggle}>
              <Video
                ref={videoRef}
                source={{ uri: media!.uri }}
                style={styles.fullMedia}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={isVideoPlaying}
                isLooping
                isMuted={isMuted}
                useNativeControls={false}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                onLoad={() => setIsLoading(false)}
              />
              {!isVideoPlaying && !isLoading && (
                <View style={styles.playOverlay}>
                  <View style={styles.playButton}>
                    <Ionicons name="play" size={40} color="#fff" />
                  </View>
                </View>
              )}
            </Pressable>
          )}

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {isVideo && (
            <Pressable
              style={[styles.muteButton, { bottom: insets.bottom + 20 }]}
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
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
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
    right: 20,
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
