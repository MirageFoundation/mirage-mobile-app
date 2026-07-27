import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, View } from "react-native";
import { getVideoThumbnailUri, type ResolvedMedia } from "./post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import {
  applyVideoBufferProfile,
  useVideoPlayerController,
  useVideoPlayerLeaseVersion,
} from "@/src/hooks/use-video-player-controller";
import { useVideoMuteStore } from "@/src/stores";
import { canonicalVideoAssetId } from "@/src/utils/video-asset-id";
import {
  adoptHandoffPlayer,
  isVideoPlayerControlledElsewhere,
  releaseHandoffPlayer,
  type VideoPlayerLease,
} from "@/src/utils/video-player-handoff";
import {
  clearVideoPrepareMark,
  markVideoFirstFrame,
  markVideoPrepareStart,
} from "@/src/utils/video-ttff";
import { getMediaImagePolicy } from "./media-image-policy";
import { replaceVideoPlayerSourceAsync } from "@/src/utils/video-source-replacement";
import {
  GALLERY_ASPECT_RATIO_CACHE,
  GALLERY_LOADED_CACHE,
  galleryStyles,
} from "./media-gallery-shared";

type GalleryVideoItemProps = {
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
};

/**
 * A single video inside a media gallery. Owns its player with the same
 * lifecycle as single-video post cards: warm/active buffer profiles,
 * feed->detail handoff (offer in feed, adopt in detail), TTFF marks, and the
 * background-repaint nudge.
 */
export const GalleryVideoItem = memo(function GalleryVideoItem({
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
}: GalleryVideoItemProps) {
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
  const handoffKey = itemUri.startsWith("file://")
    ? null
    : canonicalVideoAssetId(itemUri);
  // Same feed -> detail player handoff as single-video posts: the feed
  // gallery card stays mounted underneath the pushed detail screen, so the
  // detail gallery adopts its already-buffered player instead of creating a
  // fresh one and re-streaming the HLS.
  const [adoptedLease, setAdoptedLease] = useState<VideoPlayerLease | null>(null);
  const adoptedPlayer = adoptedLease?.player ?? null;
  useLayoutEffect(() => {
    if (!isPostDetail || !handoffKey || !shouldPrepare) return;
    const lease = adoptHandoffPlayer(handoffKey, itemUri);
    if (!lease) return;
    setAdoptedLease(lease);
    return () => {
      setAdoptedLease(null);
      releaseHandoffPlayer(lease);
    };
  }, [isPostDetail, handoffKey, itemUri, shouldPrepare]);
  const controllerPlayer = useVideoPlayerController(
    shouldPrepare && !adoptedLease ? item.uri : null,
    {
      loop: true,
      muted: effectiveMuted,
      shouldPlay: shouldPlayVideo && !adoptedLease,
      bufferProfile: isPostDetail
        ? "detail"
        : shouldPlayVideo
          ? "feedActive"
          : "feedWarm",
      // Offer onward: feed items offer to detail, detail items offer to the
      // fullscreen preview.
      handoffKey,
    },
  );
  const videoPlayer = adoptedPlayer ?? controllerPlayer;

  // Stand down while a surface stacked above (fullscreen preview) holds a
  // newer lease on this player; re-assert once it releases.
  const leaseVersion = useVideoPlayerLeaseVersion();
  const controlledElsewhere = isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease);

  // An adopted player bypasses the controller's option effects, so detail
  // applies its settings directly.
  useEffect(() => {
    if (!adoptedPlayer) return;
    if (isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      applyVideoBufferProfile(adoptedPlayer, "detail");
      adoptedPlayer.loop = true;
    } catch {
      // Native player was released underneath us (feed unmounted).
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, leaseVersion]);
  useEffect(() => {
    if (!adoptedPlayer) return;
    if (isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      adoptedPlayer.muted = effectiveMuted;
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, effectiveMuted, leaseVersion]);
  useEffect(() => {
    if (!adoptedPlayer) return;
    if (isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      if (shouldPlayVideo) {
        adoptedPlayer.play();
      } else {
        adoptedPlayer.pause();
      }
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, shouldPlayVideo, leaseVersion]);

  // When the fullscreen preview releases this player, nudge the surface to
  // repaint and resume playback if we still want it playing.
  const wasControlledElsewhereRef = useRef(false);
  useEffect(() => {
    const was = wasControlledElsewhereRef.current;
    wasControlledElsewhereRef.current = controlledElsewhere;
    if (!was || controlledElsewhere) return;
    if (!shouldPlayVideo) return;
    try {
      if (videoPlayer.status === "readyToPlay") {
        const position = videoPlayer.currentTime;
        videoPlayer.currentTime = position;
        videoPlayer.play();
      }
    } catch {
      // Player already released; the prepare gates will recreate it.
    }
  }, [controlledElsewhere, shouldPlayVideo, videoPlayer]);

  useEffect(() => {
    if (shouldPrepare) {
      markVideoPrepareStart(itemUri);
      return;
    }
    clearVideoPrepareMark(itemUri);
  }, [itemUri, shouldPrepare]);

  // Returning from background can leave the video surface blank even though
  // the player reports playing. A seek-in-place forces the native layer to
  // repaint the current frame (same nudge as single-video cards).
  const wasBackgroundedRef = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        wasBackgroundedRef.current = true;
        return;
      }
      if (nextState !== "active" || !wasBackgroundedRef.current) return;
      wasBackgroundedRef.current = false;
      if (!shouldPlayVideo) return;
      if (isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) return;
      try {
        if (videoPlayer.status === "readyToPlay") {
          const position = videoPlayer.currentTime;
          videoPlayer.currentTime = position;
          videoPlayer.play();
        }
      } catch {
        // Player already released; the prepare gates will recreate it.
      }
    });
    return () => sub.remove();
  }, [shouldPlayVideo, videoPlayer, adoptedLease]);

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
          GALLERY_ASPECT_RATIO_CACHE.set(item.uri, ratio);
          onAspectRatioDetected?.(item.uri, ratio);
        }
      }
    };

    const sourceSubscription = videoPlayer.addListener(
      "sourceLoad",
      ({ availableVideoTracks }) => {
        markLoaded();
        applyAspectRatio(availableVideoTracks);
        if (shouldPlayVideo && !isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) {
          videoPlayer.play();
        }
      },
    );
    const statusSubscription = videoPlayer.addListener(
      "statusChange",
      ({ status }) => {
        if (status === "readyToPlay") {
          markLoaded();
          applyAspectRatio(videoPlayer.availableVideoTracks);
          if (shouldPlayVideo && !isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) {
            videoPlayer.play();
          }
        } else if (status === "error" && errorRetryCountRef.current < 3) {
          errorRetryCountRef.current += 1;
          if (errorRetryRef.current) clearTimeout(errorRetryRef.current);
          errorRetryRef.current = setTimeout(() => {
            if (cancelled) return;
            setIsLoading(true);
            void replaceVideoPlayerSourceAsync(videoPlayer, item.uri).catch(() => {
              if (!cancelled) setIsLoading(false);
            });
          }, 2000 * errorRetryCountRef.current);
        }
      },
    );
    if (videoPlayer.status === "readyToPlay") {
      markLoaded();
      applyAspectRatio(videoPlayer.availableVideoTracks);
      if (shouldPlayVideo && !isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) {
        videoPlayer.play();
      }
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
  }, [item.uri, onAspectRatioDetected, shouldPlayVideo, shouldPrepare, videoPlayer, adoptedLease]);

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
                GALLERY_ASPECT_RATIO_CACHE.set(item.uri, ratio);
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
          onFirstFrameRender={() => {
            setIsLoading(false);
            markVideoFirstFrame(itemUri, isPostDetail ? "gallery-detail" : "gallery-feed");
          }}
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
