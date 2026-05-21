import { useCallback, useEffect, useRef, useState, memo } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, type SharedValue } from "react-native-reanimated";
import { Audio, AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";

import {
  buildVideoPositionKey,
  useVideoPositionStore,
  useVideoMuteStore,
} from "@/src/stores";
import { getVideoThumbnailUri } from "@/src/components/molecules/post-card-utils";

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
      if (!s.isLoaded) return;
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
    [durationMs, isPlaying, videoPositionKey, setPosition],
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

  return (
    <GestureDetector gesture={tap}>
      <View style={styles.mediaItem}>
        {isVideo ? (
          <Video
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
