import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { ResolvedMedia } from "./post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import { GalleryImageItem } from "./gallery-image-item";
import { GalleryVideoItem } from "./gallery-video-item";
import {
  GALLERY_WIDTH,
  computeGalleryHeight,
  galleryStyles,
  getGalleryItemAspectRatio,
} from "./media-gallery-shared";
import { hasGalleryItemAspectRatio } from "./media-gallery-sizing";

type MediaGalleryProps = {
  media: ResolvedMedia[];
  onMediaPress?: (index: number) => void;
  screenActive?: boolean;
  allowAutoplay?: boolean;
  isVisible?: boolean;
  isFocused?: boolean;
  isPostDetail?: boolean;
  shouldBlurContent?: boolean;
  onRevealContent?: () => void;
};

/**
 * Horizontal pager for multi-media posts. Owns paging, active-index
 * tracking, and per-item height sizing; the items themselves are
 * self-contained (`GalleryVideoItem`, `GalleryImageItem`).
 */
export const MediaGallery = memo(function MediaGallery({
  media,
  onMediaPress,
  screenActive = true,
  allowAutoplay = true,
  isVisible = true,
  isFocused = true,
  isPostDetail = false,
  shouldBlurContent = false,
  onRevealContent,
}: MediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const activeIndexRef = useRef(0);

  const itemRatiosRef = useRef<Map<string, number>>(new Map());

  const getHeightForIndex = useCallback((index: number): number => {
    const item = media[index];
    if (!item) return computeGalleryHeight(16 / 9);
    const cached = itemRatiosRef.current.get(item.uri);
    if (cached) return computeGalleryHeight(cached);
    return computeGalleryHeight(getGalleryItemAspectRatio(item));
  }, [media]);

  const firstItemHeight = getHeightForIndex(0);
  const [containerHeight, setContainerHeight] = useState(firstItemHeight);
  const mediaIdentity = media.map((item) => item.uri).join("|");

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    setContainerHeight(firstItemHeight);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [firstItemHeight, mediaIdentity]);

  const handleAspectRatioDetected = useCallback(
    (uri: string, ratio: number) => {
      const currentItem = media[activeIndexRef.current];
      if (currentItem?.uri === uri) {
        if (!isPostDetail && !hasGalleryItemAspectRatio(currentItem)) return;
        itemRatiosRef.current.set(uri, ratio);
        const newHeight = computeGalleryHeight(ratio);
        setContainerHeight((prev) => {
          if (Math.abs(prev - newHeight) < 1) return prev;
          return newHeight;
        });
      }
    },
    [isPostDetail, media],
  );

  const updateActiveIndex = useCallback(
    (requestedIndex: number) => {
      const newIndex = Math.max(0, Math.min(requestedIndex, media.length - 1));
      const item = media[newIndex];
      if (!item) return;

      activeIndexRef.current = newIndex;
      setActiveIndex((current) => (current === newIndex ? current : newIndex));

      const ratio = isPostDetail || hasGalleryItemAspectRatio(item)
        ? itemRatiosRef.current.get(item.uri) ?? getGalleryItemAspectRatio(item)
        : getGalleryItemAspectRatio(item);
      const newHeight = computeGalleryHeight(ratio);
      setContainerHeight((current) =>
        Math.abs(current - newHeight) < 1 ? current : newHeight,
      );
    },
    [isPostDetail, media],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        updateActiveIndex(viewableItems[0].index);
      }
    },
    [updateActiveIndex],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateActiveIndex(
        Math.round(event.nativeEvent.contentOffset.x / GALLERY_WIDTH),
      );
    },
    [updateActiveIndex],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: ResolvedMedia; index: number }) => {
      const isVideo = item.type === "video";
      return (
        <View style={[galleryStyles.itemWrapper, { width: GALLERY_WIDTH, height: containerHeight }]}>
          {isVideo ? (
            <GalleryVideoItem
              item={item}
              width={GALLERY_WIDTH}
              height={containerHeight}
              isActive={index === activeIndex}
              screenActive={screenActive}
              onPress={() => onMediaPress?.(index)}
              onAspectRatioDetected={handleAspectRatioDetected}
              allowAutoplay={allowAutoplay && !shouldBlurContent}
              isVisible={isVisible}
              isFocused={isFocused}
              isPostDetail={isPostDetail}
              shouldPrepare={
                screenActive &&
                isVisible &&
                isFocused &&
                Math.abs(index - activeIndex) <= 1
              }
            />
          ) : (
            <GalleryImageItem
              item={item}
              width={GALLERY_WIDTH}
              height={containerHeight}
              onPress={() => onMediaPress?.(index)}
              onAspectRatioDetected={handleAspectRatioDetected}
              isPostDetail={isPostDetail}
              isVisible={isVisible}
            />
          )}
        </View>
      );
    },
    [onMediaPress, containerHeight, activeIndex, screenActive, handleAspectRatioDetected, allowAutoplay, isVisible, isFocused, isPostDetail, shouldBlurContent],
  );

  const keyExtractor = useCallback(
    (item: ResolvedMedia, index: number) => `${item.uri}-${index}`,
    [],
  );

  return (
    <View style={[galleryStyles.galleryRoot, { height: containerHeight }]}>
      <FlatList
        ref={flatListRef}
        data={media}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!shouldBlurContent}
        onViewableItemsChanged={onViewableItemsChanged}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        viewabilityConfig={viewabilityConfig}
        snapToInterval={GALLERY_WIDTH}
        decelerationRate="fast"
        extraData={`${activeIndex}:${containerHeight}`}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        getItemLayout={(_, index) => ({
          length: GALLERY_WIDTH,
          offset: GALLERY_WIDTH * index,
          index,
        })}
      />
      {media.length > 1 && (
        <View style={galleryStyles.indicators}>
          {media.map((_, index) => (
            <View
              key={index}
              style={[
                galleryStyles.dot,
                index === activeIndex && galleryStyles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
      {shouldBlurContent && (
        <Pressable onPress={onRevealContent} style={galleryStyles.blurOverlay}>
          <BlurView
            intensity={80}
            tint="dark"
            // Real blur on Android too (web parity, BUG-020).
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={galleryStyles.blurViewFill}
          >
            <View style={galleryStyles.revealTextContainer}>
              <Ionicons name="eye-outline" size={24} color="#fff" />
              <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                Tap to reveal
              </Text>
            </View>
          </BlurView>
        </Pressable>
      )}
    </View>
  );
});
