import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent, useEventListener } from "expo";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const effectiveMuted = isPostDetail
    ? globalMuted
    : allowAutoplay
      ? (globalMuted || !isFocused)
      : globalMuted;
  const [isLoading, setIsLoading] = useState(() => !GALLERY_LOADED_CACHE.has(item.uri));
  const [feedTappedToPlay, setFeedTappedToPlay] = useState(false);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const errorRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRetryCountRef = useRef(0);

  const shouldLoadVideo = isActive && screenActive;
  const [playerActive, setPlayerActive] = useState(shouldLoadVideo);
  const [playerMounted, setPlayerMounted] = useState(shouldLoadVideo);
  const playerActiveTimerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (shouldLoadVideo) {
      if (playerActiveTimerRef2.current) {
        clearTimeout(playerActiveTimerRef2.current);
        playerActiveTimerRef2.current = null;
      }
      setPlayerActive(true);
      setPlayerMounted(true);
    } else {
      if (playerActiveTimerRef2.current) clearTimeout(playerActiveTimerRef2.current);
      playerActiveTimerRef2.current = setTimeout(() => {
        playerActiveTimerRef2.current = null;
        setPlayerActive(false);
        setPlayerMounted(false);
      }, 1500);
    }
    return () => {
      if (playerActiveTimerRef2.current) {
        clearTimeout(playerActiveTimerRef2.current);
        playerActiveTimerRef2.current = null;
      }
    };
  }, [shouldLoadVideo]);

  const videoSource = useMemo(
    () => {
      if (!playerActive) return null;
      const isHls = item.uri.includes(".m3u8");
      return { uri: item.uri, useCaching: !isHls };
    },
    [playerActive, item.uri, retryKey],
  );

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = effectiveMuted;
    p.timeUpdateEventInterval = 0;
  });

  const { status } = useEvent(player, "statusChange", { status: player.status });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  useEventListener(player, "statusChange", ({ status: newStatus }) => {
    if (newStatus === "readyToPlay") {
      setIsLoading(false);
      GALLERY_LOADED_CACHE.add(item.uri);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      errorRetryCountRef.current = 0;
      if (errorRetryRef.current) {
        clearTimeout(errorRetryRef.current);
        errorRetryRef.current = null;
      }
    }
    if (newStatus === "error") {
      if (errorRetryCountRef.current < 3) {
        errorRetryCountRef.current += 1;
        if (errorRetryRef.current) clearTimeout(errorRetryRef.current);
        errorRetryRef.current = setTimeout(() => {
          setIsLoading(true);
          setRetryKey((k) => k + 1);
        }, 2000 * errorRetryCountRef.current);
      }
    }
  });

  useEffect(() => {
    player.muted = effectiveMuted;
  }, [effectiveMuted, player]);

  useEffect(() => {
    if (GALLERY_LOADED_CACHE.has(item.uri)) return;
    loadingTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      GALLERY_LOADED_CACHE.add(item.uri);
    }, 8000);
    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      if (pauseDelayRef.current) clearTimeout(pauseDelayRef.current);
      if (errorRetryRef.current) clearTimeout(errorRetryRef.current);
    };
  }, []);

  const shouldPlay = isActive && screenActive && playerActive && (isVisible ?? true) && (allowAutoplay || feedTappedToPlay);

  useEffect(() => {
    try {
      if (shouldPlay) {
        player.play();
      } else {
        player.pause();
      }
    } catch {}
  }, [shouldPlay, player]);

  const shouldPlayRef = useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && shouldPlayRef.current) {
        setTimeout(() => { try { playerRef.current.play(); } catch {} }, 100);
      }
    });
    return () => sub.remove();
  }, []);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  const handleFeedVideoTap = useCallback(() => {
    if (isPostDetail) return;
    if (!allowAutoplay && !isPlaying && !feedTappedToPlay) {
      setFeedTappedToPlay(true);
      player.play();
      return;
    }
    onPress?.();
  }, [isPostDetail, allowAutoplay, isPlaying, feedTappedToPlay, onPress, player]);

  const handleMuteToggle = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  const thumbnailUri = getVideoThumbnailUri(item.uri);
  const showThumbnail = thumbnailUri && !firstFrameRendered;

  return (
    <View style={[galleryStyles.itemContainer, { width, height }]}>
      {showThumbnail ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={[galleryStyles.itemMedia, { width, height, position: "absolute", zIndex: 0 }]}
          contentFit="cover"
          cachePolicy="memory-disk"
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
      ) : null}
      {playerMounted ? (
        <VideoView
          player={player}
          style={[galleryStyles.itemMedia, { width, height }]}
          contentFit="cover"
          nativeControls={false}
          onFirstFrameRender={() => {
            setFirstFrameRendered(true);
            setIsLoading(false);
            GALLERY_LOADED_CACHE.add(item.uri);
          }}
        />
      ) : (
        <View style={[galleryStyles.itemMedia, { width, height }]} />
      )}

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
    <Pressable onPress={onPress} style={[galleryStyles.itemContainer, { width, height }]}>
      <Image
        source={{ uri: item.uri }}
        style={[galleryStyles.itemMedia, { width, height }]}
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
        <View style={[galleryStyles.itemWrapper, { width: GALLERY_WIDTH, height: maxHeight }]}>
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

const galleryStyles = StyleSheet.create((theme) => ({
  galleryRoot: {
    overflow: "hidden",
    borderRadius: theme.radius.md,
  },
  itemWrapper: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  itemContainer: {
    overflow: "hidden",
    borderRadius: theme.radius.md,
  },
  itemMedia: {
    borderRadius: theme.radius.md,
  },
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
}));
