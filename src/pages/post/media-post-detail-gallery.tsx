import { useCallback, type ComponentProps } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, { type SharedValue } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { Box, Text } from "@/src/components/ui/primitives";
import { MediaProcessingOverlay } from "@/src/components/molecules/post-card-media-overlays";
import type { PressedMediaTransition } from "@/src/utils/post-transition";
import {
  MediaItemView,
  type MediaItem,
  type VideoApi,
} from "./media-post-detail-media-item";
import { formatTime } from "./media-post-detail-seek-bar";
import { styles } from "./media-post-detail-styles";

const SCREEN_WIDTH = Dimensions.get("window").width;

type MediaPostDetailGalleryProps = {
  activeIndex: number;
  activeMedia: MediaItem | undefined;
  activeStatus: {
    position: number;
    duration: number;
    playing: boolean;
  };
  collapseProgress: SharedValue<number>;
  compactOverlayStyle: ComponentProps<typeof Animated.View>["style"];
  expandMedia: () => void;
  globalMuted: boolean;
  isFocused: boolean;
  isVideoProcessing: boolean;
  isVideoActive: boolean;
  mediaContainerStyle: ComponentProps<typeof Animated.View>["style"];
  mediaItems: MediaItem[];
  onMuteToggle: () => void;
  onPlayPause: () => void;
  onVideoReady?: () => void;
  registerVideo: (key: string, api: VideoApi | null) => void;
  setActiveIndex: (index: number) => void;
  sourceMediaTransition?: PressedMediaTransition | null;
  videoSyncScope?: string;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
};

export function MediaPostDetailGallery({
  activeIndex,
  activeMedia,
  activeStatus,
  collapseProgress,
  compactOverlayStyle,
  expandMedia,
  globalMuted,
  isFocused,
  isVideoProcessing,
  isVideoActive,
  mediaContainerStyle,
  mediaItems,
  onMuteToggle,
  onPlayPause,
  onVideoReady,
  registerVideo,
  setActiveIndex,
  sourceMediaTransition,
  videoSyncScope,
  onSwipeUp,
  onSwipeDown,
}: MediaPostDetailGalleryProps) {
  const getInitialPreviewUri = useCallback((item: MediaItem) => {
    if (!sourceMediaTransition || sourceMediaTransition.uri !== item.uri) return undefined;
    if (item.type === "video") return sourceMediaTransition.previewUri || undefined;
    return sourceMediaTransition.previewUri || sourceMediaTransition.uri;
  }, [sourceMediaTransition]);

  const getInitialPositionSeconds = useCallback((item: MediaItem) => {
    if (!sourceMediaTransition || sourceMediaTransition.uri !== item.uri) return undefined;
    return sourceMediaTransition.positionSeconds;
  }, [sourceMediaTransition]);

  const renderCarouselItem = useCallback(
    ({ item, index }: { item: MediaItem; index: number }) => (
      <View style={[styles.carouselItem, { width: SCREEN_WIDTH }]}>
        <MediaItemView
          item={item}
          isActive={index === activeIndex}
          screenActive={isFocused}
          shouldPrepare={isFocused && Math.abs(index - activeIndex) <= 1}
          collapseProgress={collapseProgress}
          onTapWhenCollapsed={expandMedia}
          registerVideo={registerVideo}
          videoKey={`m-${index}`}
          videoSyncScope={videoSyncScope}
          initialPreviewUri={getInitialPreviewUri(item)}
          initialPositionSeconds={getInitialPositionSeconds(item)}
          onVideoReady={onVideoReady}
        />
      </View>
    ),
    [
      activeIndex,
      collapseProgress,
      expandMedia,
      getInitialPreviewUri,
      getInitialPositionSeconds,
      isFocused,
      onVideoReady,
      registerVideo,
      videoSyncScope,
    ],
  );

  const handleCarouselMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
    },
    [activeIndex, setActiveIndex],
  );

  const handleVerticalSwipe = useCallback(
    (direction: "up" | "down") => {
      Sentry.addBreadcrumb({
        category: "expo-video",
        message: `Post detail swipe ${direction}`,
        level: "info",
        data: {
          active_index: activeIndex,
          media_type: activeMedia?.type,
          is_video_active: isVideoActive,
          is_playing: activeStatus.playing,
          position_ms: Math.round(activeStatus.position),
          duration_ms: Math.round(activeStatus.duration),
        },
      });
      if (direction === "up") {
        onSwipeUp?.();
      } else {
        onSwipeDown?.();
      }
    },
    [activeIndex, activeMedia?.type, activeStatus, isVideoActive, onSwipeDown, onSwipeUp],
  );

  const verticalSwipeGesture = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-20, 20])
    .onEnd((event) => {
      const { translationY, velocityY } = event;
      if (translationY < -30 || velocityY < -400) {
        runOnJS(handleVerticalSwipe)("up");
      } else if (translationY > 30 || velocityY > 400) {
        runOnJS(handleVerticalSwipe)("down");
      }
    });

  return (
    <GestureDetector gesture={verticalSwipeGesture}>
    <Animated.View
      style={[
        styles.mediaContainer,
        mediaContainerStyle,
      ]}
    >
        {mediaItems.length > 1 ? (
          <FlatList
            data={mediaItems}
            renderItem={renderCarouselItem}
            keyExtractor={(item, index) => `${item.uri}-${index}`}
            style={{ flex: 1 }}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleCarouselMomentumEnd}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
          />
        ) : activeMedia ? (
          <MediaItemView
            item={activeMedia}
            isActive
            screenActive={isFocused}
            shouldPrepare={isFocused}
            collapseProgress={collapseProgress}
            onTapWhenCollapsed={expandMedia}
            registerVideo={registerVideo}
            videoKey="m-0"
            videoSyncScope={videoSyncScope}
            initialPreviewUri={getInitialPreviewUri(activeMedia)}
            initialPositionSeconds={getInitialPositionSeconds(activeMedia)}
            onVideoReady={onVideoReady}
          />
        ) : null}

        {mediaItems.length > 1 && (
          <View style={styles.dotsRow}>
            {mediaItems.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === activeIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        )}

        {isVideoActive && (
          <Animated.View
            style={[styles.compactRow, compactOverlayStyle]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={onPlayPause}
              hitSlop={8}
              style={styles.compactBtn}
            >
              <Ionicons
                name={activeStatus.playing ? "pause" : "play"}
                size={16}
                color="#fff"
              />
            </Pressable>
            <Text size="xs" style={{ color: "#fff", marginLeft: 6 }}>
              {formatTime(activeStatus.position)} /{" "}
              {formatTime(activeStatus.duration)}
            </Text>
            <Box flex />
            {!isVideoProcessing ? (
              <Pressable
                onPress={onMuteToggle}
                hitSlop={8}
                style={styles.compactBtn}
              >
                <Ionicons
                  name={globalMuted ? "volume-mute" : "volume-high"}
                  size={16}
                  color="#fff"
                />
              </Pressable>
            ) : null}
          </Animated.View>
        )}
        <MediaProcessingOverlay
          visible={isVideoProcessing}
          isRedgifsVideo={false}
        />
    </Animated.View>
    </GestureDetector>
  );
}
