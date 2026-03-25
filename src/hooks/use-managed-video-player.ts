import { useVideoPlayer, type VideoSource } from "expo-video";
import { useEvent, useEventListener } from "expo";
import { useCallback, useEffect, useRef } from "react";
import {
  buildVideoPositionKey,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";

type UseManagedVideoPlayerOptions = {
  uri: string | null;
  isVisible: boolean;
  screenActive: boolean;
  shouldPlay: boolean;
  loop?: boolean;
  muted?: boolean;
  videoSyncScope?: string;
  onFirstFrame?: (width: number, height: number) => void;
  onError?: (error: any) => void;
  timeUpdateInterval?: number;
};

export function useManagedVideoPlayer({
  uri,
  isVisible,
  screenActive,
  shouldPlay,
  loop = true,
  muted,
  videoSyncScope,
  onFirstFrame,
  onError,
  timeUpdateInterval = 0.1,
}: UseManagedVideoPlayerOptions) {
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const effectiveMuted = muted ?? globalMuted;
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPosition = useVideoPositionStore((s) => s.setPosition);
  const positionKey = uri ? buildVideoPositionKey(uri, videoSyncScope) : "";
  const hasRestoredRef = useRef(false);
  const currentTimeRef = useRef(0);
  const prevUriRef = useRef(uri);

  const source: VideoSource = uri ? { uri } : null;

  const player = useVideoPlayer(source, (p) => {
    p.loop = loop;
    p.muted = effectiveMuted;
    p.timeUpdateEventInterval = timeUpdateInterval;
  });

  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  if (prevUriRef.current !== uri) {
    prevUriRef.current = uri;
    hasRestoredRef.current = false;
    currentTimeRef.current = 0;
  }

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    currentTimeRef.current = currentTime;
  });

  useEventListener(player, "statusChange", ({ status: newStatus, error }) => {
    if (newStatus === "error" && onError) {
      onError(error);
    }
    if (newStatus === "readyToPlay" && !hasRestoredRef.current && positionKey) {
      const saved = getPosition(positionKey);
      if (saved > 0.5) {
        hasRestoredRef.current = true;
        player.currentTime = saved;
      }
    }
  });

  useEffect(() => {
    player.muted = effectiveMuted;
  }, [effectiveMuted, player]);

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    const effectiveShouldPlay = shouldPlay && isVisible && screenActive;
    if (effectiveShouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [shouldPlay, isVisible, screenActive, player]);

  useEffect(() => {
    if (!screenActive && positionKey && currentTimeRef.current > 0.5) {
      setPosition(positionKey, currentTimeRef.current);
    }
  }, [screenActive, positionKey, setPosition]);

  useEffect(() => {
    return () => {
      if (positionKey && currentTimeRef.current > 0.5) {
        useVideoPositionStore
          .getState()
          .setPosition(positionKey, currentTimeRef.current);
      }
    };
  }, [positionKey]);

  const savePosition = useCallback(() => {
    if (positionKey && currentTimeRef.current > 0.5) {
      setPosition(positionKey, currentTimeRef.current);
    }
  }, [positionKey, setPosition]);

  const seekTo = useCallback(
    (seconds: number) => {
      player.currentTime = seconds;
    },
    [player],
  );

  const pause = useCallback(() => {
    player.pause();
  }, [player]);

  const play = useCallback(() => {
    player.play();
  }, [player]);

  const replay = useCallback(() => {
    player.replay();
  }, [player]);

  return {
    player,
    status,
    isPlaying,
    isLoading: status === "loading",
    isReady: status === "readyToPlay",
    isError: status === "error",
    savePosition,
    seekTo,
    pause,
    play,
    replay,
    currentTimeRef,
    duration: player.duration,
  };
}
