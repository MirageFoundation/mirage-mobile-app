import { useEffect, type Dispatch, type SetStateAction } from "react";

import { useVideoPlayerController } from "@/src/hooks/use-video-player-controller";
import { MAX_VIDEO_DURATION_MS } from "@/src/utils/video-processing";

type VideoSize = {
  width: number;
  height: number;
};

type UseVideoEditorPlayerOptions = {
  uri: string;
  isPlaying: boolean;
  trimStartMs: number;
  trimEndMs: number;
  setCurrentPosition: Dispatch<SetStateAction<number>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setResolvedVideoSize: Dispatch<SetStateAction<VideoSize>>;
  setTrimEnd: Dispatch<SetStateAction<number>>;
};

export function useVideoEditorPlayer({
  uri,
  isPlaying,
  trimStartMs,
  trimEndMs,
  setCurrentPosition,
  setDuration,
  setIsPlaying,
  setResolvedVideoSize,
  setTrimEnd,
}: UseVideoEditorPlayerOptions) {
  const player = useVideoPlayerController(uri, {
    shouldPlay: isPlaying,
    timeUpdateInterval: 0.1,
  });

  useEffect(() => {
    const applySourceMetadata = () => {
      if (player.duration <= 0) return;
      const durationMillis = player.duration * 1000;
      setDuration(durationMillis);
      setTrimEnd((currentTrimEnd) =>
        currentTrimEnd || Math.min(durationMillis, MAX_VIDEO_DURATION_MS),
      );

      const size = player.availableVideoTracks[0]?.size;
      if (size?.width && size.height) {
        setResolvedVideoSize((currentSize) =>
          currentSize.width === size.width && currentSize.height === size.height
            ? currentSize
            : size,
        );
      }
    };
    const timeSubscription = player.addListener("timeUpdate", ({ currentTime }) => {
      const positionMillis = currentTime * 1000;
      setCurrentPosition(positionMillis);
      if (positionMillis >= trimEndMs && trimEndMs > 0) {
        player.currentTime = trimStartMs / 1000;
      }
    });
    const sourceSubscription = player.addListener("sourceLoad", applySourceMetadata);
    const statusSubscription = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") applySourceMetadata();
      if (status === "error") setIsPlaying(false);
    });
    const endSubscription = player.addListener("playToEnd", () => {
      player.currentTime = trimStartMs / 1000;
      setCurrentPosition(trimStartMs);
      if (isPlaying) player.play();
    });
    if (player.status === "readyToPlay") applySourceMetadata();

    return () => {
      timeSubscription.remove();
      sourceSubscription.remove();
      statusSubscription.remove();
      endSubscription.remove();
    };
  }, [
    player,
    isPlaying,
    setCurrentPosition,
    setDuration,
    setIsPlaying,
    setResolvedVideoSize,
    setTrimEnd,
    trimEndMs,
    trimStartMs,
  ]);

  return player;
}
