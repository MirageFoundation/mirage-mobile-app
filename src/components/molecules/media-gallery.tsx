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
  GALLERY_ASPECT_RATIO_CACHE,
  GALLERY_WIDTH,
  computeGalleryHeight,
  galleryStyles,
  getGalleryItemAspectRatio,
} from "./media-gallery-shared";
import { hasGalleryItemAspectRatio, resolveGalleryItemAspectRatio, validMediaAspectRatio } from "./media-gallery-sizing";

type MediaGalleryProps = {
  media: ResolvedMedia[];
  postId?: string;
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
  postId,
  onMediaPress,
  screenActive = true,
  allowAutoplay = true,
  isVisible = true,
  isFocused = true,
  isPostDetail = false,
  shouldBlurContent = false,
  onRevealContent,
}: MediaGalleryProps) {
  const mediaIdentity = JSON.stringify(media.map((item) => item.uri));
  const [selection, setSelection] = useState({ identity: mediaIdentity, index: 0 });
  const activeIndex = selection.identity === mediaIdentity ? selection.index : 0;
  if (selection.identity !== mediaIdentity) {
    setSelection({ identity: mediaIdentity, index: 0 });
  }
  const [galleryWidth, setGalleryWidth] = useState(GALLERY_WIDTH);
  const flatListRef = useRef<FlatList>(null);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const identityRef = useRef(mediaIdentity);
  identityRef.current = mediaIdentity;
  const [detected, setDetected] = useState<{ uri: string; ratio: number }>();
  const activeItem = media[activeIndex];
  // State only triggers a render for the selected asset; the bounded URI cache
  // also retains dimensions decoded by adjacent, pre-rendered slides.
  const activeRatio = activeItem
    ? resolveGalleryItemAspectRatio(activeItem,
      detected?.uri === activeItem.uri ? detected.ratio : getGalleryItemAspectRatio(activeItem))
    : 16 / 9;
  const containerHeight = computeGalleryHeight(activeRatio, galleryWidth);

  useEffect(() => {
    flatListRef.current?.scrollToOffset({
      offset: activeIndexRef.current * galleryWidth,
      animated: false,
    });
  }, [galleryWidth, mediaIdentity]);

  const handleAspectRatioDetected = useCallback(
    (uri: string, ratio: number) => {
      if (!validMediaAspectRatio(ratio) || identityRef.current !== mediaIdentity) return;
      const item = media.find((candidate) => candidate.uri === uri);
      if (!item || hasGalleryItemAspectRatio(item)) return;
      GALLERY_ASPECT_RATIO_CACHE.set(uri, ratio);
      if (media[activeIndexRef.current]?.uri !== uri) return;
      setDetected((current) =>
        current?.uri === uri && Math.abs(current.ratio - ratio) < 0.001
          ? current
          : { uri, ratio },
      );
    },
    [media, mediaIdentity],
  );

  const updateActiveIndex = useCallback(
    (requestedIndex: number) => {
      if (identityRef.current !== mediaIdentity) return;
      const newIndex = Math.max(0, Math.min(requestedIndex, media.length - 1));
      if (!media[newIndex]) return;
      activeIndexRef.current = newIndex;
      setSelection((current) => current.identity === mediaIdentity && current.index === newIndex
        ? current
        : { identity: mediaIdentity, index: newIndex });
    },
    [media, mediaIdentity],
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
        Math.round(event.nativeEvent.contentOffset.x / galleryWidth),
      );
    },
    [galleryWidth, updateActiveIndex],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: ResolvedMedia; index: number }) => {
      const isVideo = item.type === "video";
      return (
        <View style={[galleryStyles.itemWrapper, { width: galleryWidth, height: containerHeight }]}>
          {isVideo ? (
            <GalleryVideoItem postId={postId}
              item={item}
              width={galleryWidth}
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
                (isPostDetail || (screenActive && isVisible && isFocused)) &&
                Math.abs(index - activeIndex) <= 1
              }
            />
          ) : (
            <GalleryImageItem
              item={item}
              width={galleryWidth}
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
    [postId, onMediaPress, containerHeight, activeIndex, galleryWidth, screenActive, handleAspectRatioDetected, allowAutoplay, isVisible, isFocused, isPostDetail, shouldBlurContent],
  );

  const keyExtractor = useCallback(
    (item: ResolvedMedia, index: number) => `${item.uri}-${index}`,
    [],
  );

  return (
    <View
      style={[galleryStyles.galleryRoot, { height: containerHeight }]}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        if (width > 0 && Math.abs(width - galleryWidth) >= 1) {
          setGalleryWidth(width);
        }
      }}
    >
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
        snapToInterval={galleryWidth}
        decelerationRate="fast"
        extraData={`${activeIndex}:${containerHeight}:${galleryWidth}`}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        getItemLayout={(_, index) => ({
          length: galleryWidth,
          offset: galleryWidth * index,
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
