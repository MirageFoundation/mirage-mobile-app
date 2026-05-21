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

import { Box, Text } from "@/src/components/ui/primitives";
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
  isVideoActive: boolean;
  mediaContainerStyle: ComponentProps<typeof Animated.View>["style"];
  mediaItems: MediaItem[];
  onMuteToggle: () => void;
  onPlayPause: () => void;
  registerVideo: (key: string, api: VideoApi | null) => void;
  setActiveIndex: (index: number) => void;
  sourceMediaTransition?: PressedMediaTransition | null;
  videoSyncScope?: string;
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
  isVideoActive,
  mediaContainerStyle,
  mediaItems,
  onMuteToggle,
  onPlayPause,
  registerVideo,
  setActiveIndex,
  sourceMediaTransition,
  videoSyncScope,
}: MediaPostDetailGalleryProps) {
  const getInitialPreviewUri = useCallback((item: MediaItem) => {
    if (!sourceMediaTransition || sourceMediaTransition.uri !== item.uri) return undefined;
    return sourceMediaTransition.previewUri || sourceMediaTransition.uri;
  }, [sourceMediaTransition]);

  const renderCarouselItem = useCallback(
    ({ item, index }: { item: MediaItem; index: number }) => (
      <View style={[styles.carouselItem, { width: SCREEN_WIDTH }]}>
        <MediaItemView
          item={item}
          isActive={index === activeIndex}
          screenActive={isFocused}
          collapseProgress={collapseProgress}
          onTapWhenCollapsed={expandMedia}
          registerVideo={registerVideo}
          videoKey={`m-${index}`}
          videoSyncScope={videoSyncScope}
          initialPreviewUri={getInitialPreviewUri(item)}
        />
      </View>
    ),
    [
      activeIndex,
      collapseProgress,
      expandMedia,
      getInitialPreviewUri,
      isFocused,
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

  return (
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
            collapseProgress={collapseProgress}
            onTapWhenCollapsed={expandMedia}
            registerVideo={registerVideo}
            videoKey="m-0"
            videoSyncScope={videoSyncScope}
            initialPreviewUri={getInitialPreviewUri(activeMedia)}
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
          </Animated.View>
        )}
    </Animated.View>
  );
}
