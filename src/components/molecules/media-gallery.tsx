import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { type CompatVideoRef, ResizeMode, Video } from "@/src/lib/expo-av-compat";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ResolvedMedia } from "./post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import { useVideoMuteStore } from "@/src/stores";


const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;
const GALLERY_WIDTH = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
const MEDIA_MAX_HEIGHT = 450;

const ASPECT_RATIO_CACHE = new Map<string, number>();
const GALLERY_LOADED_CACHE = new Set<string>();

function getVideoThumbnailUri(uri?: string): string {
  if (!uri) return "";
  if (uri.includes("cloudflarestream.com") || uri.includes("videodelivery.net")) {
    const match = uri.match(/(?:cloudflarestream\.com|videodelivery\.net)\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return `https://videodelivery.net/${match[1]}/thumbnails/thumbnail.jpg?time=1s&width=480`;
  }
  return "";
}

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
  isFocused?: boolean;
  isPostDetail?: boolean;
  shouldBlurContent?: boolean;
  onRevealContent?: () => void;
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
  isFocused = true,
  isPostDetail,
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
  isFocused?: boolean;
  isPostDetail?: boolean;
}) {
  const videoRef = useRef<CompatVideoRef | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const effectiveMuted = isPostDetail ? globalMuted : (globalMuted || !isFocused);
  const [isLoading, setIsLoading] = useState(() => !GALLERY_LOADED_CACHE.has(item.uri));
  const [feedTappedToPlay, setFeedTappedToPlay] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (GALLERY_LOADED_CACHE.has(item.uri)) return;
    loadingTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      GALLERY_LOADED_CACHE.add(item.uri);
    }, 8000);
    return () => {
      videoRef.current?.pauseAsync().catch(() => {});
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      if (pauseDelayRef.current) {
        clearTimeout(pauseDelayRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isActive && screenActive && isVisible && (allowAutoplay || feedTappedToPlay)) {
      if (pauseDelayRef.current) {
        clearTimeout(pauseDelayRef.current);
        pauseDelayRef.current = null;
      }
      setIsPlaying(true);
    } else if (!screenActive) {
      if (pauseDelayRef.current) {
        clearTimeout(pauseDelayRef.current);
        pauseDelayRef.current = null;
      }
      setIsPlaying(false);
      videoRef.current?.pauseAsync().catch(() => {});
    } else if (!isVisible) {
      if (!pauseDelayRef.current) {
        pauseDelayRef.current = setTimeout(() => {
          pauseDelayRef.current = null;
          setIsPlaying(false);
          videoRef.current?.pauseAsync().catch(() => {});
        }, 400);
      }
    }
  }, [isActive, screenActive, allowAutoplay, isVisible, feedTappedToPlay]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const handleFeedVideoTap = useCallback(() => {
    if (isPostDetail) return;
    if (!allowAutoplay && !isPlaying && !feedTappedToPlay) {
      setFeedTappedToPlay(true);
      setIsPlaying(true);
      return;
    }
    onPress?.();
  }, [isPostDetail, allowAutoplay, isPlaying, feedTappedToPlay, onPress]);

  const handleMuteToggle = useCallback(async () => {
    const newGlobalMuted = !globalMuted;
    toggleMute();
    try {
      if (videoRef.current) {
        const newEffective = isPostDetail ? newGlobalMuted : (newGlobalMuted || !isFocused);
        if (!newEffective) {
          await videoRef.current.pauseAsync();
          await videoRef.current.setStatusAsync({ isMuted: false });
          await videoRef.current.playAsync();
        } else {
          await videoRef.current.setStatusAsync({ isMuted: true });
        }
      }
    } catch {}
  }, [globalMuted, toggleMute, isFocused, isPostDetail]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.setStatusAsync({ isMuted: effectiveMuted }).catch(() => {});
    }
  }, [effectiveMuted]);

  const thumbnailUri = getVideoThumbnailUri(item.uri);
  const showThumbnail = thumbnailUri && !GALLERY_LOADED_CACHE.has(item.uri);

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      {showThumbnail ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={{ width, height, position: "absolute", zIndex: 0 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : null}
      <Video
        ref={videoRef}
        source={{ uri: item.uri }}
        style={{ width, height }}
        resizeMode={ResizeMode.COVER}
        shouldPlay={isPlaying && isActive && screenActive}
        isMuted={effectiveMuted}
        isLooping
        useNativeControls={false}
        onLoad={() => {
          setIsLoading(false);
          GALLERY_LOADED_CACHE.add(item.uri);
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          videoRef.current?.setStatusAsync({ isMuted: effectiveMuted }).catch(() => {});
        }}
        onPlaybackStatusUpdate={(status) => {
          if (status.isLoaded && (status.isPlaying || status.durationMillis)) {
            setIsLoading(false);
            GALLERY_LOADED_CACHE.add(item.uri);
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          }
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
        {isPostDetail ? (
          <>
            <Pressable onPress={handlePlayPause} style={galleryStyles.videoTapArea} />
            {isLoading && !GALLERY_LOADED_CACHE.has(item.uri) ? (
              <View style={galleryStyles.controlButton} pointerEvents="none">
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : !isPlaying ? (
              <View style={galleryStyles.controlButton} pointerEvents="none">
                <Ionicons name="play" size={28} color="#fff" />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Pressable onPress={handleFeedVideoTap} style={galleryStyles.videoTapArea} />
            {isLoading && !GALLERY_LOADED_CACHE.has(item.uri) ? (
              <View style={galleryStyles.controlButton}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : !allowAutoplay && !isPlaying && !feedTappedToPlay ? (
              <View style={galleryStyles.tapToPlayContainer} pointerEvents="none">
                <Text size="sm" weight="semibold" numberOfLines={1} style={{ color: "#fff" }}>
                  Tap to play
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      {isPostDetail && (
        <Pressable
          onPress={onPress}
          style={galleryStyles.fullscreenButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={galleryStyles.fullscreenButtonInner}>
            <Ionicons name="expand" size={16} color="#fff" />
          </View>
        </Pressable>
      )}

      <Pressable
        onPress={handleMuteToggle}
        style={galleryStyles.muteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={galleryStyles.muteButtonInner}>
          <Ionicons name={globalMuted ? "volume-mute" : "volume-high"} size={16} color="#fff" />
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
  const [loaded, setLoaded] = useState(false);
  const imageLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    imageLoadTimeoutRef.current = setTimeout(() => {
      setLoaded(true);
    }, 5000);
    return () => {
      if (imageLoadTimeoutRef.current) {
        clearTimeout(imageLoadTimeoutRef.current);
      }
    };
  }, [item.uri]);

  return (
    <Pressable onPress={onPress} style={{ width, height, overflow: "hidden" }}>
      <Image
        source={{ uri: item.uri }}
        style={{ width, height }}
        contentFit="cover"
        cachePolicy="memory-disk"
        onLoad={({ source }) => {
          setLoaded(true);
          if (imageLoadTimeoutRef.current) clearTimeout(imageLoadTimeoutRef.current);
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

      {!loaded && (
        <View style={galleryStyles.loadingOverlay}>
          <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
        </View>
      )}

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
    return computeGalleryHeight(getItemAspectRatio(item));
  }, [media]);

  const [containerHeight, setContainerHeight] = useState(() => getHeightForIndex(0));

  const handleAspectRatioDetected = useCallback(
    (uri: string, ratio: number) => {
      itemRatiosRef.current.set(uri, ratio);
      const currentItem = media[activeIndexRef.current];
      if (currentItem?.uri === uri) {
        const newHeight = computeGalleryHeight(ratio);
        setContainerHeight((prev) => {
          if (Math.abs(prev - newHeight) < 1) return prev;
          return newHeight;
        });
      }
    },
    [media],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const newIndex = viewableItems[0].index;
        activeIndexRef.current = newIndex;
        setActiveIndex(newIndex);

        const item = media[newIndex];
        if (item) {
          const ratio = itemRatiosRef.current.get(item.uri) ?? getItemAspectRatio(item);
          const newHeight = computeGalleryHeight(ratio);
          setContainerHeight((prev) => {
            if (Math.abs(prev - newHeight) < 1) return prev;
            return newHeight;
          });
        }
      }
    },
    [media],
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const maxHeight = Math.max(...media.map((_, i) => getHeightForIndex(i)));

  const renderItem = useCallback(
    ({ item, index }: { item: ResolvedMedia; index: number }) => {
      const itemHeight = getHeightForIndex(index);
      const isVideo = item.type === "video";
      return (
        <View style={{ width: GALLERY_WIDTH, height: maxHeight }}>
          {isVideo ? (
            <GalleryVideoItem
              item={item}
              width={GALLERY_WIDTH}
              height={itemHeight}
              isActive={index === activeIndexRef.current}
              screenActive={screenActive}
              onPress={() => onMediaPress?.(index)}
              onAspectRatioDetected={handleAspectRatioDetected}
              allowAutoplay={allowAutoplay && !shouldBlurContent}
              isVisible={isVisible}
              isFocused={isFocused}
              isPostDetail={isPostDetail}
            />
          ) : (
            <GalleryImageItem
              item={item}
              width={GALLERY_WIDTH}
              height={itemHeight}
              onPress={() => onMediaPress?.(index)}
              onAspectRatioDetected={handleAspectRatioDetected}
            />
          )}
        </View>
      );
    },
    [onMediaPress, maxHeight, getHeightForIndex, screenActive, handleAspectRatioDetected, allowAutoplay, isVisible, isFocused, isPostDetail, shouldBlurContent],
  );

  const keyExtractor = useCallback(
    (item: ResolvedMedia, index: number) => `${item.uri}-${index}`,
    [],
  );

  return (
    <View style={{ height: containerHeight, overflow: "hidden" }}>
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
      {shouldBlurContent && (
        <Pressable onPress={onRevealContent} style={galleryStyles.blurOverlay}>
          {Platform.OS === "ios" ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={galleryStyles.blurViewFill}
            >
              <View style={galleryStyles.revealTextContainer}>
                <Ionicons name="eye-outline" size={24} color="#fff" />
                <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                  Tap to reveal
                </Text>
              </View>
            </BlurView>
          ) : (
            <View style={galleryStyles.androidBlurOverlay}>
              <Ionicons name="eye-outline" size={24} color="#fff" />
              <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                Tap to reveal
              </Text>
            </View>
          )}
        </Pressable>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  tapToPlayContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
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
  fullscreenButton: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 20,
  },
  fullscreenButtonInner: {
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  blurViewFill: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  revealTextContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  androidBlurOverlay: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 5, 5, 0.97)",
    gap: 8,
  },
});
