import { useEventListener } from "expo";
import { createAudioPlayer } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import type {
  SourceLoadEventPayload,
  StatusChangeEventPayload,
  TimeUpdateEventPayload,
  VideoPlayer,
  VideoSource,
  VideoView as ExpoVideoView,
} from "expo-video";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { StyleProp, ViewStyle } from "react-native";

export const ResizeMode = {
  CONTAIN: "contain",
  COVER: "cover",
  STRETCH: "stretch",
} as const;

type ResizeModeValue = (typeof ResizeMode)[keyof typeof ResizeMode];

type CompatSource = { uri: string } | string | number | null | undefined;

type CompatStatusUpdate = {
  isMuted?: boolean;
  shouldPlay?: boolean;
  positionMillis?: number;
  volume?: number;
  isLooping?: boolean;
};

export type AVPlaybackStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  positionMillis: number;
  durationMillis?: number;
  didJustFinish: boolean;
  error?: string;
};

export type CompatVideoRef = {
  playAsync: () => Promise<AVPlaybackStatus>;
  pauseAsync: () => Promise<AVPlaybackStatus>;
  replayAsync: () => Promise<AVPlaybackStatus>;
  setStatusAsync: (status: CompatStatusUpdate) => Promise<AVPlaybackStatus>;
  getStatusAsync: () => Promise<AVPlaybackStatus>;
  setPositionAsync: (positionMillis: number) => Promise<AVPlaybackStatus>;
};

type CompatVideoProps = {
  source: CompatSource;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ResizeModeValue;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  useNativeControls?: boolean;
  onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
  onLoad?: (event?: { source?: CompatSource }) => void;
  onReadyForDisplay?: (event: { naturalSize?: { width: number; height: number } }) => void;
  onError?: (error: unknown) => void;
};

function normalizeSource(source: CompatSource): VideoSource {
  if (source == null) return null;
  if (typeof source === "number" || typeof source === "string") return source;
  if (typeof source === "object" && "uri" in source) return source.uri;
  return null;
}

function mapResizeMode(mode?: ResizeModeValue): "contain" | "cover" | "fill" {
  if (mode === ResizeMode.COVER) return "cover";
  if (mode === ResizeMode.STRETCH) return "fill";
  return "contain";
}

function createStatus(player: VideoPlayer, didJustFinish = false, error?: string): AVPlaybackStatus {
  const durationMillis = Number.isFinite(player.duration) ? Math.round(player.duration * 1000) : undefined;
  const positionMillis = Number.isFinite(player.currentTime) ? Math.round(player.currentTime * 1000) : 0;
  const inferredDidJustFinish =
    didJustFinish ||
    (!!durationMillis && durationMillis > 0 && positionMillis >= durationMillis);

  return {
    isLoaded: player.status === "readyToPlay",
    isPlaying: player.playing,
    isBuffering: player.status === "loading",
    positionMillis,
    durationMillis,
    didJustFinish: inferredDidJustFinish,
    ...(error ? { error } : {}),
  };
}

export const Video = forwardRef<CompatVideoRef, CompatVideoProps>(function Video(
  {
    source,
    style,
    resizeMode,
    shouldPlay = false,
    isLooping = false,
    isMuted = false,
    useNativeControls = false,
    onPlaybackStatusUpdate,
    onLoad,
    onReadyForDisplay,
    onError,
  },
  ref,
) {
  const normalizedSource = useMemo(() => normalizeSource(source), [source]);
  const latestStatusRef = useRef<AVPlaybackStatus | null>(null);
  const lastDidFinishRef = useRef(false);
  const latestNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const viewRef = useRef<ExpoVideoView | null>(null);

  const player = useVideoPlayer(normalizedSource, (playerInstance) => {
    playerInstance.loop = isLooping;
    playerInstance.muted = isMuted;
    playerInstance.timeUpdateEventInterval = 0.1;
    if (shouldPlay) {
      playerInstance.play();
    }
  });

  const emitStatus = useCallback(
    (nextStatus?: AVPlaybackStatus) => {
      const resolvedStatus = nextStatus ?? createStatus(player, lastDidFinishRef.current);
      latestStatusRef.current = resolvedStatus;
      onPlaybackStatusUpdate?.(resolvedStatus);
      if (resolvedStatus.didJustFinish) {
        queueMicrotask(() => {
          lastDidFinishRef.current = false;
        });
      }
      return resolvedStatus;
    },
    [onPlaybackStatusUpdate, player],
  );

  useEffect(() => {
    player.loop = isLooping;
  }, [isLooping, player]);

  useEffect(() => {
    player.muted = isMuted;
    emitStatus();
  }, [emitStatus, isMuted, player]);

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
    emitStatus();
  }, [emitStatus, player, shouldPlay]);

  useEventListener(player, "statusChange", (payload: StatusChangeEventPayload) => {
    const status = createStatus(player, lastDidFinishRef.current, payload.error?.message);
    emitStatus(status);
    if (payload.error) {
      onError?.(payload.error);
    }
  });

  useEventListener(player, "playingChange", ({ isPlaying }) => {
    emitStatus({
      ...createStatus(player, lastDidFinishRef.current),
      isPlaying,
    });
  });

  useEventListener(player, "timeUpdate", (payload: TimeUpdateEventPayload) => {
    emitStatus({
      ...createStatus(player, lastDidFinishRef.current),
      positionMillis: Math.round(payload.currentTime * 1000),
      isBuffering: player.status === "loading",
    });
  });

  useEventListener(player, "playToEnd", () => {
    lastDidFinishRef.current = true;
    emitStatus({
      ...createStatus(player, true),
      didJustFinish: true,
      isPlaying: false,
    });
  });

  useEventListener(player, "sourceLoad", (payload: SourceLoadEventPayload) => {
    const firstTrack = payload.availableVideoTracks[0];
    const naturalSize = firstTrack?.size;
    if (naturalSize?.width && naturalSize?.height) {
      latestNaturalSizeRef.current = naturalSize;
      onReadyForDisplay?.({ naturalSize });
    }
    onLoad?.({ source });
    emitStatus({
      ...createStatus(player, false),
      isLoaded: true,
      durationMillis: Math.round(payload.duration * 1000),
    });
  });

  useImperativeHandle(ref, () => ({
    playAsync: async () => {
      lastDidFinishRef.current = false;
      player.play();
      return emitStatus();
    },
    pauseAsync: async () => {
      player.pause();
      return emitStatus();
    },
    replayAsync: async () => {
      lastDidFinishRef.current = false;
      player.replay();
      return emitStatus();
    },
    setStatusAsync: async (status) => {
      if (typeof status.isMuted === "boolean") {
        player.muted = status.isMuted;
      }
      if (typeof status.isLooping === "boolean") {
        player.loop = status.isLooping;
      }
      if (typeof status.volume === "number") {
        player.volume = status.volume;
      }
      if (typeof status.positionMillis === "number") {
        player.currentTime = status.positionMillis / 1000;
      }
      if (typeof status.shouldPlay === "boolean") {
        if (status.shouldPlay) {
          lastDidFinishRef.current = false;
          player.play();
        } else {
          player.pause();
        }
      }
      return emitStatus();
    },
    getStatusAsync: async () => {
      return latestStatusRef.current ?? createStatus(player, lastDidFinishRef.current);
    },
    setPositionAsync: async (positionMillis: number) => {
      player.currentTime = positionMillis / 1000;
      return emitStatus({
        ...createStatus(player, false),
        positionMillis,
      });
    },
  }), [emitStatus, player]);

  return (
    <VideoView
      ref={viewRef}
      player={player}
      style={style}
      nativeControls={useNativeControls}
      contentFit={mapResizeMode(resizeMode)}
      onFirstFrameRender={() => {
        const naturalSize = latestNaturalSizeRef.current;
        if (naturalSize) {
          onReadyForDisplay?.({ naturalSize });
        }
        onLoad?.({ source });
        emitStatus();
      }}
    />
  );
});

type CompatAudioStatus = {
  isLoaded: boolean;
  durationMillis?: number;
  positionMillis: number;
  isPlaying: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
};

function normalizeAudioSource(source: CompatSource): string | number | null {
  if (source == null) return null;
  if (typeof source === "number" || typeof source === "string") return source;
  if (typeof source === "object" && "uri" in source) return source.uri;
  return null;
}

function createAudioStatus(player: ReturnType<typeof createAudioPlayer>): CompatAudioStatus {
  const currentStatus = player.currentStatus;
  return {
    isLoaded: currentStatus?.isLoaded ?? true,
    durationMillis: Number.isFinite(currentStatus?.duration)
      ? Math.round((currentStatus?.duration ?? 0) * 1000)
      : undefined,
    positionMillis: Number.isFinite(currentStatus?.currentTime)
      ? Math.round((currentStatus?.currentTime ?? 0) * 1000)
      : 0,
    isPlaying: currentStatus?.playing ?? player.playing ?? false,
    isBuffering: currentStatus?.isBuffering ?? false,
    didJustFinish: currentStatus?.didJustFinish ?? false,
  };
}

async function waitForAudioLoad(player: ReturnType<typeof createAudioPlayer>) {
  const timeoutAt = Date.now() + 4000;
  while (Date.now() < timeoutAt) {
    const status = createAudioStatus(player);
    if (status.isLoaded && status.durationMillis !== undefined) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return createAudioStatus(player);
}

export const Audio = {
  Sound: {
    createAsync: async (source: CompatSource) => {
      const player = createAudioPlayer(normalizeAudioSource(source));
      await waitForAudioLoad(player);

      return {
        sound: {
          getStatusAsync: async () => createAudioStatus(player),
          unloadAsync: async () => {
            player.remove();
          },
        },
      };
    },
  },
};
