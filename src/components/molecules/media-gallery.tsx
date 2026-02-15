import { memo, useCallback, useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { StyleSheet } from "react-native-unistyles";
import type { ResolvedMedia } from "./post-card-utils";

const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;
const GALLERY_WIDTH = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
const DEFAULT_ASPECT_RATIO = 4 / 5;

type MediaGalleryProps = {
  media: ResolvedMedia[];
  onMediaPress?: (index: number) => void;
  screenActive?: boolean;
};

const GalleryItem = memo(function GalleryItem({
  item,
  width,
  height,
  onPress,
}: {
  item: ResolvedMedia;
  width: number;
  height: number;
  onPress?: () => void;
}) {
  const isVideo = item.type === "video";

  return (
    <Pressable onPress={onPress} style={{ width, height }}>
      {isVideo ? (
        <Video
          source={{ uri: item.uri }}
          style={{ width, height }}
          resizeMode={ResizeMode.COVER}
          shouldPlay={false}
          isMuted
          isLooping
        />
      ) : (
        <Image
          source={{ uri: item.uri }}
          style={{ width, height }}
          contentFit="cover"
          transition={200}
        />
      )}
    </Pressable>
  );
});

export const MediaGallery = memo(function MediaGallery({
  media,
  onMediaPress,
  screenActive = true,
}: MediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const galleryHeight = GALLERY_WIDTH / DEFAULT_ASPECT_RATIO;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: ResolvedMedia; index: number }) => (
      <GalleryItem
        item={item}
        width={GALLERY_WIDTH}
        height={galleryHeight}
        onPress={() => onMediaPress?.(index)}
      />
    ),
    [onMediaPress, galleryHeight],
  );

  const keyExtractor = useCallback(
    (item: ResolvedMedia, index: number) => `${item.uri}-${index}`,
    [],
  );

  return (
    <View style={{ height: galleryHeight }}>
      <FlatList
        ref={flatListRef}
        data={media}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        snapToInterval={GALLERY_WIDTH}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: GALLERY_WIDTH,
          offset: GALLERY_WIDTH * index,
          index,
        })}
      />
      {media.length > 1 && (
        <View style={styles.indicators}>
          {media.map((_, index) => (
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
    </View>
  );
});

const styles = StyleSheet.create({
  indicators: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
