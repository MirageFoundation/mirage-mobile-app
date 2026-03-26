import { Ionicons } from "@expo/vector-icons";
import { useEvent, useEventListener } from "expo";
import { Image } from "expo-image";
import {
  useVideoPlayer,
  VideoView,
  type VideoPlayer,
  type VideoSource,
} from "expo-video";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Pressable, View } from "react-native";
import PagerView from "react-native-pager-view";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { useVideoMuteStore } from "@/src/stores";

import type { ResolvedMedia } from "./post-card-utils";
import { SensitiveContentOverlay } from "./sensitive-content-overlay";

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
    if (match?.[1]) {
      return `https://videodelivery.net/${match[1]}/thumbnails/thumbnail.jpg?time=1s&width=480`;
    }
  }
  return "";
}

function getItemAspectRatio(item: ResolvedMedia): number {
  const cached = ASPECT_RATIO_CACHE.get(item.uri);
  if (cached) return cached;
  if (item.aspectRatio && item.aspectRatio !== 16 / 9) return item.aspectRatio;
  if (item.width && item.height) return item.width / item.height;
  return item.type === "video" ? 4 / 3 : 16 / 9;
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

type GalleryActiveVideoSlideProps = {
  item: ResolvedMedia;
  player: VideoPlayer;
  width: number;
  height: number;
  isLoading: boolean;
  isPlaying: boolean;
  showThumbnail: boolean;
  thumbnailUri: string;
  allowAutoplay: boolean;
  feedTappedToPlay: boolean;
  isPostDetail: boolean;
  globalMuted: boolean;
  onPress?: () => void;
  onAspectRatioDetected?: (uri: string, ratio: number) => void;
  onFirstFrameRender: () => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onRequestTapToPlay: () => void;
};

const GalleryActiveVideoSlide = memo(function GalleryActiveVideoSlide({
  item,
  player,
  width,
  height,
  isLoading,
  isPlaying,
  showThumbnail,
  thumbnailUri,
  allowAutoplay,
  feedTappedToPlay,
  isPostDetail,
  globalMuted,
  onPress,
  onAspectRatioDetected,
  onFirstFrameRender,
  onTogglePlay,
  onToggleMute,
  onRequestTapToPlay,
}: GalleryActiveVideoSlideProps) {
  const thumbnailOpacity = useRef(
    new Animated.Value(showThumbnail ? 1 : 0),
  ).current;

  useEffect(() => {
    if (!thumbnailUri) {
      return;
    }

    if (showThumbnail) {
      thumbnailOpacity.stopAnimation();
      thumbnailOpacity.setValue(1);
      return;
    }

    Animated.timing(thumbnailOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [showThumbnail, thumbnailOpacity, thumbnailUri]);

  const handleFeedVideoTap = useCallback(() => {
    if (isPostDetail) return;
    if (!allowAutoplay && !isPlaying && !feedTappedToPlay) {
      onRequestTapToPlay();
      return;
    }
    onPress?.();
  }, [allowAutoplay, feedTappedToPlay, isPlaying, isPostDetail, onPress, onRequestTapToPlay]);

  return (
    <View style={[galleryStyles.itemContainer, { width, height }]}>
      {thumbnailUri ? (
        <Animated.View
          pointerEvents="none"
          style={[
            galleryStyles.thumbnailOverlay,
            { width, height, opacity: thumbnailOpacity },
          ]}
        >
          <Image
            source={{ uri: thumbnailUri }}
            style={[galleryStyles.itemMedia, { width, height }]}
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
        </Animated.View>
      ) : null}

      <VideoView
        player={player}
        style={[
          styles.fill,
          galleryStyles.itemMedia,
          { width, height },
        ]}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
        useExoShutter={false}
        onFirstFrameRender={onFirstFrameRender}
      />

      <View style={galleryStyles.playOverlay}>
        {isPostDetail ? (
          <>
            <Pressable onPress={onTogglePlay} style={galleryStyles.videoTapArea} />
            {isLoading ? (
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
            {isLoading ? (
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
        onPress={onToggleMute}
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

const GalleryInactiveVideoSlide = memo(function GalleryInactiveVideoSlide({
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
  const thumbnailUri = getVideoThumbnailUri(item.uri);

  return (
    <Pressable onPress={onPress} style={[galleryStyles.itemContainer, { width, height }]}>
      {thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={[galleryStyles.itemMedia, { width, height }]}
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
      ) : (
        <View style={[galleryStyles.itemMedia, galleryStyles.videoFallback, { width, height }]} />
      )}

      <View style={galleryStyles.playOverlay} pointerEvents="none">
        <View style={galleryStyles.controlButton}>
          <Ionicons name="play" size={28} color="#fff" />
        </View>
      </View>

      <View style={galleryStyles.typeBadge}>
        <Text size="xs" weight="bold" style={{ color: "#fff" }}>
          VIDEO
        </Text>
      </View>
    </Pressable>
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
  const [feedTappedToPlay, setFeedTappedToPlay] = useState(false);
  const [activeVideoLoading, setActiveVideoLoading] = useState(false);
  const [activeFirstFrameRendered, setActiveFirstFrameRendered] = useState(false);
  const itemRatiosRef = useRef<Map<string, number>>(new Map());
  const replaceVersionRef = useRef(0);
  const activeVideoUriRef = useRef<string | null>(null);

  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);

  const setupPlayer = useCallback((createdPlayer: VideoPlayer) => {
    createdPlayer.loop = true;
    createdPlayer.timeUpdateEventInterval = 0;
  }, []);
  const player = useVideoPlayer(null, setupPlayer);

  const { status: playerStatus } = useEvent(player, "statusChange", {
    status: player.status,
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  const getHeightForIndex = useCallback((index: number): number => {
    const item = media[index];
    if (!item) return computeGalleryHeight(16 / 9);
    const cached = itemRatiosRef.current.get(item.uri);
    if (cached) return computeGalleryHeight(cached);
    return computeGalleryHeight(getItemAspectRatio(item));
  }, [media]);

  const [containerHeight, setContainerHeight] = useState(() => getHeightForIndex(0));

  const activeItem = media[activeIndex];
  const activeVideo =
    !shouldBlurContent && activeItem?.type === "video" ? activeItem : null;
  const activeVideoUri = activeVideo?.uri ?? null;
  const effectiveMuted = isPostDetail
    ? globalMuted
    : allowAutoplay
      ? (globalMuted || !isFocused)
      : globalMuted;
  const shouldPlayActiveVideo =
    !!activeVideo &&
    screenActive &&
    isVisible &&
    (allowAutoplay || feedTappedToPlay);
  const shouldPlayActiveVideoRef = useRef(shouldPlayActiveVideo);
  shouldPlayActiveVideoRef.current = shouldPlayActiveVideo;

  useEventListener(player, "statusChange", ({ status }) => {
    const currentUri = activeVideoUriRef.current;
    if (status === "readyToPlay") {
      if (currentUri) {
        GALLERY_LOADED_CACHE.add(currentUri);
      }
      setActiveVideoLoading(false);
      return;
    }

    if (status === "loading") {
      if (currentUri && !GALLERY_LOADED_CACHE.has(currentUri)) {
        setActiveVideoLoading(true);
      }
      return;
    }

    if (status === "error") {
      setActiveVideoLoading(false);
    }
  });

  useEffect(() => {
    try {
      player.muted = effectiveMuted;
    } catch {}
  }, [effectiveMuted, player]);


  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(media.length - 1, 0)));
  }, [media.length]);

  useEffect(() => {
    const item = media[activeIndex];
    if (!item) return;
    const ratio = itemRatiosRef.current.get(item.uri) ?? getItemAspectRatio(item);
    const newHeight = computeGalleryHeight(ratio);
    setContainerHeight((prev) => {
      if (Math.abs(prev - newHeight) < 1) return prev;
      return newHeight;
    });
  }, [activeIndex, getHeightForIndex, media]);

  const activeVideoSource = useMemo<VideoSource | null>(() => {
    if (!activeVideoUri) {
      return null;
    }

    return {
      uri: activeVideoUri,
      useCaching: !activeVideoUri.includes(".m3u8"),
    };
  }, [activeVideoUri]);

  useEffect(() => {
    activeVideoUriRef.current = activeVideoUri;
    setFeedTappedToPlay(false);
    setActiveFirstFrameRendered(false);

    const replaceVersion = ++replaceVersionRef.current;

    try {
      player.pause();
    } catch {}

    if (!activeVideoUri || !activeVideoSource) {
      setActiveVideoLoading(false);
      return;
    }

    setActiveVideoLoading(!GALLERY_LOADED_CACHE.has(activeVideoUri));

    void player.replaceAsync(activeVideoSource).then(() => {
      if (replaceVersion !== replaceVersionRef.current) {
        return;
      }
      if (shouldPlayActiveVideoRef.current) {
        try {
          player.play();
        } catch {}
      }
    }).catch(() => {
      if (replaceVersion === replaceVersionRef.current) {
        setActiveVideoLoading(false);
      }
    });
  }, [activeVideoSource, activeVideoUri, player]);

  useEffect(() => {
    if (!activeVideoUri) {
      return;
    }

    try {
      if (playerStatus === "readyToPlay" && shouldPlayActiveVideo) {
        player.play();
      } else if (!shouldPlayActiveVideo) {
        player.pause();
      }
    } catch {}
  }, [activeVideoUri, player, playerStatus, shouldPlayActiveVideo]);

  const handleAspectRatioDetected = useCallback((uri: string, ratio: number) => {
    itemRatiosRef.current.set(uri, ratio);
    const currentItem = media[activeIndex];
    if (currentItem?.uri !== uri) return;

    const newHeight = computeGalleryHeight(ratio);
    setContainerHeight((prev) => {
      if (Math.abs(prev - newHeight) < 1) return prev;
      return newHeight;
    });
  }, [activeIndex, media]);

  const handlePageSelected = useCallback((event: { nativeEvent: { position: number } }) => {
    const nextIndex = event.nativeEvent.position;
    setActiveIndex((prev) => (prev === nextIndex ? prev : nextIndex));
  }, []);

  const handleToggleMute = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  const handleTogglePlay = useCallback(() => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {}
  }, [isPlaying, player]);

  const pageStyle = { width: GALLERY_WIDTH, height: containerHeight };
  const activeThumbnailUri = activeVideo ? getVideoThumbnailUri(activeVideo.uri) : "";
  const showActiveThumbnail = !!activeThumbnailUri && !activeFirstFrameRendered;

  return (
    <View style={[galleryStyles.galleryRoot, { height: containerHeight }]}>
      <PagerView
        style={styles.fill}
        initialPage={0}
        onPageSelected={handlePageSelected}
        overdrag={false}
        scrollEnabled={!shouldBlurContent}
      >
        {media.map((item, index) => {
          const itemHeight = getHeightForIndex(index);
          const itemPress = () => onMediaPress?.(index);

          return (
            <View key={`${item.uri}-${index}`} style={pageStyle}>
              {item.type === "video" ? (
                shouldBlurContent ? (
                  <GalleryInactiveVideoSlide
                    item={item}
                    width={GALLERY_WIDTH}
                    height={itemHeight}
                    onPress={itemPress}
                    onAspectRatioDetected={handleAspectRatioDetected}
                  />
                ) : index === activeIndex && activeVideo ? (
                  <GalleryActiveVideoSlide
                    item={item}
                    player={player}
                    width={GALLERY_WIDTH}
                    height={itemHeight}
                    isLoading={activeVideoLoading}
                    isPlaying={isPlaying}
                    showThumbnail={showActiveThumbnail}
                    thumbnailUri={activeThumbnailUri}
                    allowAutoplay={allowAutoplay && !shouldBlurContent}
                    feedTappedToPlay={feedTappedToPlay}
                    isPostDetail={isPostDetail}
                    globalMuted={globalMuted}
                    onPress={itemPress}
                    onAspectRatioDetected={handleAspectRatioDetected}
                    onFirstFrameRender={() => {
                      setActiveFirstFrameRendered(true);
                      setActiveVideoLoading(false);
                      if (activeVideoUriRef.current) {
                        GALLERY_LOADED_CACHE.add(activeVideoUriRef.current);
                      }
                    }}
                    onTogglePlay={handleTogglePlay}
                    onToggleMute={handleToggleMute}
                    onRequestTapToPlay={() => setFeedTappedToPlay(true)}
                  />
                ) : (
                  <GalleryInactiveVideoSlide
                    item={item}
                    width={GALLERY_WIDTH}
                    height={itemHeight}
                    onPress={itemPress}
                    onAspectRatioDetected={handleAspectRatioDetected}
                  />
                )
              ) : (
                <GalleryImageItem
                  item={item}
                  width={GALLERY_WIDTH}
                  height={itemHeight}
                  onPress={itemPress}
                  onAspectRatioDetected={handleAspectRatioDetected}
                />
              )}
            </View>
          );
        })}
      </PagerView>

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
        <SensitiveContentOverlay onPress={onRevealContent} style={galleryStyles.blurOverlay} />
      )}
    </View>
  );
});

const styles = StyleSheet.create(() => ({
  fill: {
    flex: 1,
  },
}));

const galleryStyles = StyleSheet.create((theme) => ({
  itemContainer: {
    overflow: "hidden",
    borderRadius: theme.radius.md,
  },
  itemMedia: {
    borderRadius: theme.radius.md,
  },
  galleryRoot: {
    overflow: "hidden",
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
  thumbnailOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 1,
  },
  videoFallback: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
}));
