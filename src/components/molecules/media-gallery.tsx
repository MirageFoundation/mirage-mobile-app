import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { getVideoThumbnailUri, type ResolvedMedia } from "./post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import {
  getCachedVideoSource,
  useVideoPlayerController,
} from "@/src/hooks/use-video-player-controller";
import { useVideoMuteStore } from "@/src/stores";
import { StyleSheet } from "react-native-unistyles";
import { BoundedLruMap, BoundedLruSet } from "@/src/utils/bounded-lru";
import { getMediaImagePolicy } from "./media-image-policy";


const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;
const GALLERY_WIDTH = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
const MEDIA_MAX_HEIGHT = 450;

const ASPECT_RATIO_CACHE = new BoundedLruMap<string, number>(256);
const GALLERY_LOADED_CACHE = new BoundedLruSet<string>(512);

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
  shouldPrepare,
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
  shouldPrepare: boolean;
}) {
  const itemUri = item.uri;
  const [isPlaying, setIsPlaying] = useState(false);
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const effectiveMuted = isPostDetail
    ? globalMuted
    : allowAutoplay
      ? (globalMuted || !isFocused)
      : globalMuted;
  const [isLoading, setIsLoading] = useState(() => !GALLERY_LOADED_CACHE.has(item.uri));
  const [feedTappedToPlay, setFeedTappedToPlay] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRetryCountRef = useRef(0);
  const shouldPlayVideo = isPlaying && isActive && screenActive && isVisible;
  const videoPlayer = useVideoPlayerController(shouldPrepare ? item.uri : null, {
    loop: true,
    muted: effectiveMuted,
    shouldPlay: shouldPlayVideo,
    bufferProfile: isPostDetail
      ? "detail"
      : shouldPlayVideo
        ? "feedActive"
        : "feedWarm",
  });

  useEffect(() => {
    if (!shouldPrepare || GALLERY_LOADED_CACHE.has(itemUri)) return;
    setIsLoading(true);
    loadingTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      GALLERY_LOADED_CACHE.add(itemUri);
    }, 8000);
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      if (pauseDelayRef.current) {
        clearTimeout(pauseDelayRef.current);
      }
      if (errorRetryRef.current) {
        clearTimeout(errorRetryRef.current);
      }
    };
  }, [itemUri, shouldPrepare]);

  useEffect(() => {
    if (!shouldPrepare) return;
    let cancelled = false;
    const markLoaded = () => {
      if (cancelled) return;
      setIsLoading(false);
      GALLERY_LOADED_CACHE.add(item.uri);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      errorRetryCountRef.current = 0;
      if (errorRetryRef.current) {
        clearTimeout(errorRetryRef.current);
        errorRetryRef.current = null;
      }
    };
    const applyAspectRatio = (
      availableVideoTracks: typeof videoPlayer.availableVideoTracks,
    ) => {
      const size = availableVideoTracks[0]?.size;
      if (size?.width && size.height) {
        const ratio = size.width / size.height;
        if (Number.isFinite(ratio) && ratio > 0) {
          ASPECT_RATIO_CACHE.set(item.uri, ratio);
          onAspectRatioDetected?.(item.uri, ratio);
        }
      }
    };

    const sourceSubscription = videoPlayer.addListener(
      "sourceLoad",
      ({ availableVideoTracks }) => {
        markLoaded();
        applyAspectRatio(availableVideoTracks);
        if (shouldPlayVideo) videoPlayer.play();
      },
    );
    const statusSubscription = videoPlayer.addListener(
      "statusChange",
      ({ status }) => {
        if (status === "readyToPlay") {
          markLoaded();
          applyAspectRatio(videoPlayer.availableVideoTracks);
          if (shouldPlayVideo) videoPlayer.play();
        } else if (status === "error" && errorRetryCountRef.current < 3) {
          errorRetryCountRef.current += 1;
          if (errorRetryRef.current) clearTimeout(errorRetryRef.current);
          errorRetryRef.current = setTimeout(() => {
            if (cancelled) return;
            setIsLoading(true);
            void videoPlayer.replaceAsync(getCachedVideoSource(item.uri)).catch(() => {
              if (!cancelled) setIsLoading(false);
            });
          }, 2000 * errorRetryCountRef.current);
        }
      },
    );
    if (videoPlayer.status === "readyToPlay") {
      markLoaded();
      applyAspectRatio(videoPlayer.availableVideoTracks);
      if (shouldPlayVideo) videoPlayer.play();
    }

    return () => {
      cancelled = true;
      sourceSubscription.remove();
      statusSubscription.remove();
      if (errorRetryRef.current) {
        clearTimeout(errorRetryRef.current);
        errorRetryRef.current = null;
      }
    };
  }, [item.uri, onAspectRatioDetected, shouldPlayVideo, shouldPrepare, videoPlayer]);

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
    } else if (!isVisible) {
      if (!pauseDelayRef.current) {
        pauseDelayRef.current = setTimeout(() => {
          pauseDelayRef.current = null;
          setIsPlaying(false);
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

  const handleMuteToggle = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  const thumbnailUri = getVideoThumbnailUri(item.uri, item.posterUri);
  const thumbnailPolicy = getMediaImagePolicy({
    uri: thumbnailUri,
    surface: isPostDetail ? "detail" : "feed",
    mediaType: "poster",
    displayWidth: width,
  });
  const showThumbnail =
    thumbnailUri && (!shouldPrepare || !GALLERY_LOADED_CACHE.has(item.uri));

  return (
    <View style={[galleryStyles.itemContainer, { width, height }]}>
      {showThumbnail ? (
        <Image
          source={{ uri: thumbnailPolicy.uri }}
          style={[galleryStyles.itemMedia, { width, height, position: "absolute", zIndex: 0 }]}
          contentFit={thumbnailPolicy.contentFit}
          cachePolicy={thumbnailPolicy.cachePolicy}
          recyclingKey={thumbnailPolicy.recyclingKey}
          allowDownscaling={thumbnailPolicy.allowDownscaling}
          enforceEarlyResizing={thumbnailPolicy.enforceEarlyResizing}
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
      {shouldPrepare ? (
        <VideoView
          player={videoPlayer}
          style={[galleryStyles.itemMedia, { width, height }]}
          contentFit="cover"
          nativeControls={false}
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
          surfaceType={Platform.OS === "android" ? "textureView" : undefined}
          onFirstFrameRender={() => setIsLoading(false)}
        />
      ) : null}

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
  isPostDetail,
}: {
  item: ResolvedMedia;
  width: number;
  height: number;
  onPress?: () => void;
  onAspectRatioDetected?: (uri: string, ratio: number) => void;
  isPostDetail: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const imageLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagePolicy = getMediaImagePolicy({
    uri: item.uri,
    surface: isPostDetail ? "detail" : "feed",
    mediaType: item.type === "gif" ? "gif" : "image",
    displayWidth: width,
  });

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
        source={{ uri: imagePolicy.uri }}
        style={[galleryStyles.itemMedia, { width, height }]}
        contentFit={imagePolicy.contentFit}
        cachePolicy={imagePolicy.cachePolicy}
        recyclingKey={imagePolicy.recyclingKey}
        allowDownscaling={imagePolicy.allowDownscaling}
        enforceEarlyResizing={imagePolicy.enforceEarlyResizing}
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

  const updateActiveIndex = useCallback(
    (requestedIndex: number) => {
      const newIndex = Math.max(0, Math.min(requestedIndex, media.length - 1));
      const item = media[newIndex];
      if (!item) return;

      activeIndexRef.current = newIndex;
      setActiveIndex((current) => (current === newIndex ? current : newIndex));

      const ratio = itemRatiosRef.current.get(item.uri) ?? getItemAspectRatio(item);
      const newHeight = computeGalleryHeight(ratio);
      setContainerHeight((current) =>
        Math.abs(current - newHeight) < 1 ? current : newHeight,
      );
    },
    [media],
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

  const maxHeight = useMemo(
    () => Math.max(...media.map((_, index) => getHeightForIndex(index))),
    [getHeightForIndex, media],
  );

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
              height={itemHeight}
              onPress={() => onMediaPress?.(index)}
              onAspectRatioDetected={handleAspectRatioDetected}
              isPostDetail={isPostDetail}
            />
          )}
        </View>
      );
    },
    [onMediaPress, maxHeight, getHeightForIndex, activeIndex, screenActive, handleAspectRatioDetected, allowAutoplay, isVisible, isFocused, isPostDetail, shouldBlurContent],
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
        extraData={activeIndex}
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
