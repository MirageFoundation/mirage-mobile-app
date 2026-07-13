import { useCallback, useEffect, useRef, useState, memo } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Audio, AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import * as Sentry from "@sentry/react-native";

import {
  buildVideoPositionKey,
  useVideoPositionStore,
  useVideoMuteStore,
} from "@/src/stores";
import { getVideoThumbnailUri } from "@/src/components/molecules/post-card-utils";
import { isExpectedVideoLifecycleError } from "@/src/components/utils/native-video-playback";

import { styles } from "./media-post-detail-styles";

const AnimatedVideo = Animated.createAnimatedComponent(Video);

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
  collapseProgress: SharedValue<number>;
  onTapWhenCollapsed: () => void;
  registerVideo: (key: string, api: VideoApi | null) => void;
  videoKey: string;
  videoSyncScope?: string;
  initialPreviewUri?: string;
};

export const MediaItemView = memo(function MediaItemView({
  item,
  isActive,
  screenActive,
  collapseProgress,
  onTapWhenCollapsed,
  registerVideo,
  videoKey,
  videoSyncScope,
  initialPreviewUri,
}: ItemRenderProps) {
  const videoRef = useRef<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPosition = useVideoPositionStore((s) => s.setPosition);
  const currentVideoPositionRef = useRef(0);
  const hasRestoredVideoPositionRef = useRef(false);
  const hasReportedLoadErrorRef = useRef(false);

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

  const isVideo = item.type === "video";
  const videoPreviewUri = isVideo
    ? initialPreviewUri || getVideoThumbnailUri(item.uri, item.posterUri)
    : "";
  const mediaPreviewUri = initialPreviewUri || (isVideo ? videoPreviewUri : item.uri);
  const [showInitialPreview, setShowInitialPreview] = useState(!!mediaPreviewUri);
  const videoPositionKey = isVideo
    ? buildVideoPositionKey(item.uri, videoSyncScope)
    : "";

  useEffect(() => {
    setShowInitialPreview(!!mediaPreviewUri);
  }, [mediaPreviewUri]);

  const saveVideoPosition = useCallback(() => {
    if (!videoPositionKey) return;
    const seconds = currentVideoPositionRef.current / 1000;
    if (seconds > 0.5) setPosition(videoPositionKey, seconds);
  }, [videoPositionKey, setPosition]);

  useEffect(() => {
    return () => {
      saveVideoPosition();
    };
  }, [saveVideoPosition]);

  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const s = await v.getStatusAsync();
    if (!s.isLoaded) return;
    if (s.isPlaying) {
      await v.pauseAsync();
      setIsPlaying(false);
    } else {
      if (s.didJustFinish) await v.replayAsync();
      else await v.playAsync();
      setIsPlaying(true);
    }
  }, []);

  useEffect(() => {
    if (!isVideo) return;
    const api: VideoApi = {
      toggle: togglePlay,
      seek: async (ms) => {
        await videoRef.current?.setStatusAsync({ positionMillis: ms });
        currentVideoPositionRef.current = ms;
        setPositionMs(ms);
        saveVideoPosition();
      },
      getPosition: () => positionMs,
      getDuration: () => durationMs,
      setMuted: async (m) => {
        await videoRef.current?.setStatusAsync({ isMuted: m });
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
  ]);

  const handleStatus = useCallback(
    (s: AVPlaybackStatus) => {
      if (!s.isLoaded) {
        // Unloaded statuses carry the AVPlayer failure reason for silent
        // load failures that never reach onError.
        if (s.error && !hasReportedLoadErrorRef.current) {
          hasReportedLoadErrorRef.current = true;
          Sentry.captureMessage("Media post detail video failed to load", {
            level: "error",
            tags: {
              feature: "post-media",
              operation: "detail-video-load",
            },
            extra: { uri: item.uri, error: s.error },
          });
        }
        return;
      }
      currentVideoPositionRef.current = s.positionMillis ?? 0;
      setPositionMs(s.positionMillis ?? 0);
      if (s.isPlaying && videoPositionKey) {
        const seconds = (s.positionMillis ?? 0) / 1000;
        if (seconds > 0.5) setPosition(videoPositionKey, seconds);
      }
      if (s.durationMillis && s.durationMillis !== durationMs) {
        setDurationMs(s.durationMillis);
      }
      if (typeof s.isPlaying === "boolean" && s.isPlaying !== isPlaying) {
        setIsPlaying(s.isPlaying);
      }
    },
    [durationMs, isPlaying, item.uri, videoPositionKey, setPosition],
  );

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
        {isVideo ? (
          <AnimatedVideo
            ref={videoRef}
            source={{ uri: item.uri }}
            style={styles.mediaInner}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isActive && screenActive}
            isLooping
            isMuted={globalMuted || !isActive}
            useNativeControls={false}
            progressUpdateIntervalMillis={200}
            onLoad={async () => {
              if (!videoPositionKey || hasRestoredVideoPositionRef.current) return;
              const saved = getPosition(videoPositionKey);
              if (saved > 0.5) {
                hasRestoredVideoPositionRef.current = true;
                currentVideoPositionRef.current = saved * 1000;
                setPositionMs(saved * 1000);
                await videoRef.current?.setStatusAsync({
                  positionMillis: saved * 1000,
                }).catch(() => {});
              }
            }}
            onReadyForDisplay={() => {
              setShowInitialPreview(false);
            }}
            onError={(error) => {
              Sentry.captureMessage("Media post detail video error", {
                level: isExpectedVideoLifecycleError(error) ? "warning" : "error",
                tags: {
                  feature: "post-media",
                  operation: "detail-video-playback",
                },
                extra: { uri: item.uri, error },
              });
            }}
            onPlaybackStatusUpdate={handleStatus}
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
