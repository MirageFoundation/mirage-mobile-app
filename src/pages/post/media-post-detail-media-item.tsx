import { useCallback, useEffect, useRef, useState, memo } from "react";
import { Platform, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Audio } from "expo-av";
import { Image } from "expo-image";
import { VideoView } from "expo-video";
import * as Sentry from "@sentry/react-native";

import {
  buildVideoPositionKey,
  useVideoPositionStore,
  useVideoMuteStore,
} from "@/src/stores";
import { getVideoThumbnailUri } from "@/src/components/molecules/post-card-utils";
import { useVideoPlayerController } from "@/src/hooks/use-video-player-controller";

import { styles } from "./media-post-detail-styles";

export type MediaItem = {
  uri: string;
  type: "image" | "video" | "gif";
  posterUri?: string;
  aspectRatio?: number;
};

export type VideoApi = {
  toggle: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  getPosition: () => number;
  getDuration: () => number;
  setMuted: (m: boolean) => Promise<void>;
  isPlaying: () => boolean;
};

type ItemRenderProps = {
  item: MediaItem;
  isActive: boolean;
  screenActive: boolean;
  shouldPrepare: boolean;
  collapseProgress: SharedValue<number>;
  onTapWhenCollapsed: () => void;
  registerVideo: (key: string, api: VideoApi | null) => void;
  videoKey: string;
  videoSyncScope?: string;
  initialPreviewUri?: string;
  initialPositionSeconds?: number;
  onVideoReady?: () => void;
};

export const MediaItemView = memo(function MediaItemView({
  item,
  isActive,
  screenActive,
  shouldPrepare,
  collapseProgress,
  onTapWhenCollapsed,
  registerVideo,
  videoKey,
  videoSyncScope,
  initialPreviewUri,
  initialPositionSeconds,
  onVideoReady,
}: ItemRenderProps) {
  const isVideo = item.type === "video";
  const videoPositionKey = isVideo
    ? buildVideoPositionKey(item.uri, videoSyncScope)
    : "";
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const initialPlaybackPosition = initialPositionSeconds ?? (
    videoPositionKey ? getPosition(videoPositionKey) : 0
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [positionMs, setPositionMs] = useState(initialPlaybackPosition * 1000);
  const [durationMs, setDurationMs] = useState(0);
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const setPosition = useVideoPositionStore((s) => s.setPosition);
  const currentVideoPositionRef = useRef(initialPlaybackPosition);
  const hasRestoredVideoPositionRef = useRef(initialPlaybackPosition > 0.5);
  const hasReportedLoadErrorRef = useRef(false);
  const firstFrameRenderedRef = useRef(false);
  const preparedVideoUriRef = useRef<string | null>(null);

  // --- pinch-to-zoom (only active when media is fully expanded) -------------
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setIsZoomed(false);
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  // If the sheet collapses the media, reset zoom so re-expanding starts clean.
  useAnimatedReaction(
    () => collapseProgress.value,
    (value, prev) => {
      if (value > 0.05 && (prev === null || prev <= 0.05)) {
        if (savedScale.value !== 1) runOnJS(resetZoom)();
      }
    },
  );

  const videoPreviewUri = isVideo
    ? initialPreviewUri || getVideoThumbnailUri(item.uri, item.posterUri)
    : "";
  const mediaPreviewUri = initialPreviewUri || (isVideo ? videoPreviewUri : item.uri);
  const [showInitialPreview, setShowInitialPreview] = useState(!!mediaPreviewUri);
  const videoPlayer = useVideoPlayerController(
    isVideo && shouldPrepare ? item.uri : null,
    {
      loop: true,
      muted: globalMuted || !isActive,
      shouldPlay:
        isVideo &&
        shouldPrepare &&
        isPlaying &&
        isActive &&
        screenActive,
      timeUpdateInterval: 0.2,
      initialTime: initialPlaybackPosition,
    },
  );

  useEffect(() => {
    if (!firstFrameRenderedRef.current) {
      setShowInitialPreview(!!mediaPreviewUri);
    }
  }, [mediaPreviewUri]);

  useEffect(() => {
    if (!isVideo) return;
    if (!shouldPrepare) {
      firstFrameRenderedRef.current = false;
      preparedVideoUriRef.current = null;
      setShowInitialPreview(!!mediaPreviewUri);
    } else if (preparedVideoUriRef.current !== item.uri) {
      preparedVideoUriRef.current = item.uri;
      firstFrameRenderedRef.current = false;
      setShowInitialPreview(!!mediaPreviewUri);
    }
  }, [isVideo, item.uri, mediaPreviewUri, shouldPrepare]);

  const saveVideoPosition = useCallback(() => {
    if (!videoPositionKey) return;
    const seconds = currentVideoPositionRef.current;
    if (seconds > 0.5) setPosition(videoPositionKey, seconds);
  }, [videoPositionKey, setPosition]);

  useEffect(() => {
    return () => {
      saveVideoPosition();
    };
  }, [saveVideoPosition]);

  const togglePlay = useCallback(async () => {
    setIsPlaying((playing) => !playing);
  }, []);

  useEffect(() => {
    if (!isVideo) return;
    const api: VideoApi = {
      toggle: togglePlay,
      seek: async (ms) => {
        videoPlayer.currentTime = ms / 1000;
        currentVideoPositionRef.current = ms / 1000;
        setPositionMs(ms);
        saveVideoPosition();
      },
      getPosition: () => positionMs,
      getDuration: () => durationMs,
      setMuted: async (m) => {
        videoPlayer.muted = m;
      },
      isPlaying: () => isPlaying,
    };
    registerVideo(videoKey, api);
    return () => registerVideo(videoKey, null);
  }, [
    isVideo,
    registerVideo,
    videoKey,
    positionMs,
    durationMs,
    isPlaying,
    togglePlay,
    saveVideoPosition,
    videoPlayer,
  ]);

  useEffect(() => {
    const applySourceMetadata = (duration: number) => {
      if (duration > 0) setDurationMs(duration * 1000);
      if (!hasRestoredVideoPositionRef.current) {
        const saved = videoPositionKey ? getPosition(videoPositionKey) : 0;
        hasRestoredVideoPositionRef.current = true;
        if (saved > 0.5) {
          currentVideoPositionRef.current = saved;
          setPositionMs(saved * 1000);
          videoPlayer.currentTime = saved;
        }
      }
    };
    const timeSubscription = videoPlayer.addListener("timeUpdate", ({ currentTime }) => {
      currentVideoPositionRef.current = currentTime;
      setPositionMs(currentTime * 1000);
      if (videoPositionKey && currentTime > 0.5) {
        setPosition(videoPositionKey, currentTime);
      }
    });
    const statusSubscription = videoPlayer.addListener(
      "statusChange",
      ({ status, error }) => {
        if (status === "readyToPlay") {
          applySourceMetadata(videoPlayer.duration);
        }
        if (status === "error" && error && !hasReportedLoadErrorRef.current) {
          hasReportedLoadErrorRef.current = true;
          Sentry.captureMessage("Media post detail video failed to load", {
            level: "error",
            tags: {
              feature: "post-media",
              operation: "detail-video-load",
            },
            extra: { uri: item.uri, error: error.message },
          });
        }
      },
    );
    const sourceSubscription = videoPlayer.addListener(
      "sourceLoad",
      ({ duration }) => {
        applySourceMetadata(duration);
      },
    );
    const playingSubscription = videoPlayer.addListener(
      "playingChange",
      ({ isPlaying: playerIsPlaying }) => {
        if (isActive && screenActive && playerIsPlaying) {
          setIsPlaying(true);
        }
      },
    );
    if (videoPlayer.status === "readyToPlay") {
      applySourceMetadata(videoPlayer.duration);
    }

    return () => {
      timeSubscription.remove();
      statusSubscription.remove();
      sourceSubscription.remove();
      playingSubscription.remove();
    };
  }, [getPosition, isActive, item.uri, screenActive, setPosition, videoPlayer, videoPositionKey]);

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      "worklet";
      if (collapseProgress.value > 0.05) {
        runOnJS(onTapWhenCollapsed)();
      } else if (isVideo) {
        runOnJS(togglePlay)();
      }
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      "worklet";
      if (collapseProgress.value > 0.05) return;
      const next = Math.max(1, Math.min(savedScale.value * e.scale, 4));
      scale.value = next;
    })
    .onEnd(() => {
      "worklet";
      if (scale.value <= 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(setIsZoomed)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(setIsZoomed)(true);
      }
    });

  const pan = Gesture.Pan()
    .enabled(isZoomed)
    .averageTouches(true)
    .onUpdate((e) => {
      "worklet";
      if (collapseProgress.value > 0.05 || savedScale.value <= 1) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      "worklet";
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      "worklet";
      if (collapseProgress.value > 0.05) return;
      if (savedScale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(setIsZoomed)(false);
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
        runOnJS(setIsZoomed)(true);
      }
    });

  const composed = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, tap),
  );

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.mediaItem}>
        <Animated.View style={[styles.mediaInner, zoomStyle]}>
        {isVideo && shouldPrepare ? (
          <VideoView
            player={videoPlayer}
            style={styles.mediaInner}
            contentFit="contain"
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
            surfaceType={Platform.OS === "android" ? "textureView" : undefined}
            onFirstFrameRender={() => {
              firstFrameRenderedRef.current = true;
              setShowInitialPreview(false);
              if (!item.uri.startsWith("file://")) {
                onVideoReady?.();
              }
            }}
          />
        ) : (
          <Image
            source={{ uri: item.uri }}
            style={styles.mediaInner}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={item.uri}
            onLoad={() => setShowInitialPreview(false)}
          />
        )}
        {showInitialPreview && mediaPreviewUri ? (
          <Image
            source={{ uri: mediaPreviewUri }}
            style={styles.mediaPreviewOverlay}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={mediaPreviewUri}
          />
        ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

export async function enableIosAudioPlayback() {
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  }).catch(() => {});
}
