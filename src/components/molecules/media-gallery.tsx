import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ResolvedMedia } from "./post-card-utils";
import { Text } from "@/src/components/ui/primitives";

const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;
const GALLERY_WIDTH = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
const MEDIA_MAX_HEIGHT = 450;

const ASPECT_RATIO_CACHE = new Map<string, number>();

function getItemAspectRatio(item: ResolvedMedia): number {
  const cached = ASPECT_RATIO_CACHE.get(item.uri);
  if (cached) return cached;
  if (item.aspectRatio && item.aspectRatio !== 16 / 9) return item.aspectRatio;
  if (item.width && item.height) return item.width / item.height;
  return 16 / 9;
}

function computeGalleryHeight(aspectRatio: number): number {
  return Math.min(GALLERY_WIDTH / aspectRatio, MEDIA_MAX_HEIGHT);
}

type MediaGalleryProps = {
  media: ResolvedMedia[];
  onMediaPress?: (index: number) => void;
  screenActive?: boolean;
  allowAutoplay?: boolean;
  isVisible?: boolean;
};

const GalleryVideoItem = memo(function GalleryVideoItem({
  item,
  width,
  height,
  isActive,
  screenActive,
  onPress,
  onAspectRatioDetected,
  allowAutoplay,
  isVisible,
}: {
  item: ResolvedMedia;
  width: number;
  height: number;
  isActive: boolean;
  screenActive: boolean;
  onPress?: () => void;
  onAspectRatioDetected?: (uri: string, ratio: number) => void;
  allowAutoplay?: boolean;
  isVisible?: boolean;
}) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isActive || !screenActive) {
      setIsPlaying(false);
      videoRef.current?.pauseAsync().catch(() => {});
    } else if (isActive && screenActive && allowAutoplay && isVisible) {
      setIsPlaying(true);
    }
  }, [isActive, screenActive, allowAutoplay, isVisible]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const handleMuteToggle = useCallback(async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try {
      if (videoRef.current) {
        if (!newMuted) {
          await videoRef.current.pauseAsync();
          await videoRef.current.setStatusAsync({ isMuted: false });
          await videoRef.current.playAsync();
        } else {
          await videoRef.current.setStatusAsync({ isMuted: true });
        }
      }
    } catch {}
  }, [isMuted]);

  return (
    <View style={{ width, height }}>
      <Video
        ref={videoRef}
        source={{ uri: item.uri }}
        style={{ width, height }}
        resizeMode={ResizeMode.COVER}
        shouldPlay={isPlaying && isActive && screenActive}
        isMuted={isMuted}
        isLooping
        useNativeControls={false}
        onLoad={() => {
          setIsLoading(false);
          videoRef.current?.setStatusAsync({ isMuted }).catch(() => {});
        }}
        onReadyForDisplay={(event) => {
          const { width: w, height: h } = event.naturalSize ?? {};
          if (w && h) {
            const ratio = w / h;
            if (Number.isFinite(ratio) && ratio > 0) {
              ASPECT_RATIO_CACHE.set(item.uri, ratio);
              onAspectRatioDetected?.(item.uri, ratio);
            }
          }
        }}
      />

      <View style={galleryStyles.playOverlay}>
        <Pressable onPress={onPress} style={galleryStyles.videoTapArea} />
        {isLoading ? (
          <View style={galleryStyles.controlButton}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : (
          <Pressable
            onPress={handlePlayPause}
            style={[galleryStyles.controlButton, { opacity: isPlaying ? 0.6 : 1 }]}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={handleMuteToggle}
        style={galleryStyles.muteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={galleryStyles.muteButtonInner}>
          <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={16} color="#fff" />
        </View>
      </Pressable>

      <View style={galleryStyles.typeBadge}>
        <Text size="xs" weight="bold" style={{ color: "#fff" }}>
          VIDEO
        </Text>
      </View>
    </View>
  );
});

const GalleryImageItem = memo(function GalleryImageItem({
  item,
  width,
  height,
  onPress,
  onAspectRatioDetected,
}: {
  item: ResolvedMedia;
  width: number;
  height: number;
  onPress?: () => void;
  onAspectRatioDetected?: (uri: string, ratio: number) => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ width, height }}>
      <Image
        source={{ uri: item.uri }}
        style={{ width, height }}
        contentFit="cover"
        transition={200}
        onLoad={({ source }) => {
          const w = source?.width;
          const h = source?.height;
          if (w && h) {
            const ratio = w / h;
            if (Number.isFinite(ratio) && ratio > 0) {
              ASPECT_RATIO_CACHE.set(item.uri, ratio);
              onAspectRatioDetected?.(item.uri, ratio);
            }
          }
        }}
      />

      <View style={galleryStyles.typeBadge}>
        <Text size="xs" weight="bold" style={{ color: "#fff" }}>
          {item.type === "gif" ? "GIF" : "IMG"}
        </Text>
      </View>
    </Pressable>
  );
});

export const MediaGallery = memo(function MediaGallery({
  media,
  onMediaPress,
  screenActive = true,
  allowAutoplay = true,
  isVisible = true,
}: MediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const activeIndexRef = useRef(0);
  const aspectRatioLockedRef = useRef(false);

  const initialAspectRatio = getItemAspectRatio(media[0]);
  const [galleryAspectRatio, setGalleryAspectRatio] = useState(initialAspectRatio);
  const galleryHeight = computeGalleryHeight(galleryAspectRatio);

  const handleAspectRatioDetected = useCallback(
    (uri: string, ratio: number) => {
      if (aspectRatioLockedRef.current) return;
      if (uri === media[0]?.uri) {
        aspectRatioLockedRef.current = true;
        setGalleryAspectRatio((current) =>
          Math.abs(current - ratio) < 0.01 ? current : ratio,
        );
      }
    },
    [media],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        activeIndexRef.current = viewableItems[0].index;
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: ResolvedMedia; index: number }) => {
      const isVideo = item.type === "video";
      if (isVideo) {
        return (
          <GalleryVideoItem
            item={item}
            width={GALLERY_WIDTH}
            height={galleryHeight}
            isActive={index === activeIndexRef.current}
            screenActive={screenActive}
            onPress={() => onMediaPress?.(index)}
            onAspectRatioDetected={handleAspectRatioDetected}
            allowAutoplay={allowAutoplay}
            isVisible={isVisible}
          />
        );
      }
      return (
        <GalleryImageItem
          item={item}
          width={GALLERY_WIDTH}
          height={galleryHeight}
          onPress={() => onMediaPress?.(index)}
          onAspectRatioDetected={handleAspectRatioDetected}
        />
      );
    },
    [onMediaPress, galleryHeight, screenActive, handleAspectRatioDetected, allowAutoplay, isVisible],
  );

  const keyExtractor = useCallback(
    (item: ResolvedMedia, index: number) => `${item.uri}-${index}`,
    [],
  );

  return (
    <View style={{ aspectRatio: GALLERY_WIDTH / galleryHeight }}>
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
        extraData={activeIndex}
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
    </View>
  );
});

const galleryStyles = StyleSheet.create({
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
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  videoTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    bottom: 8,
    right: 8,
  },
  muteButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 20,
  },
});
