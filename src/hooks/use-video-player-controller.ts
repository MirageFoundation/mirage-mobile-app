import { useEffect } from "react";
import { useVideoPlayer, type VideoPlayer, type VideoSource } from "expo-video";

type VideoPlayerControllerOptions = {
  muted?: boolean;
  loop?: boolean;
  shouldPlay?: boolean;
  timeUpdateInterval?: number;
  initialTime?: number;
};

export function getCachedVideoSource(source: VideoSource): VideoSource {
  if (typeof source !== "string" || !/^https?:\/\//i.test(source)) {
    return source;
  }
  const path = source.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".m3u8") || path.endsWith(".mpd")) {
    return source;
  }
  return {
    uri: source,
    useCaching: true,
  };
}

export function useVideoPlayerController(
  source: VideoSource,
  {
    muted = false,
    loop = false,
    shouldPlay = false,
    timeUpdateInterval = 0,
    initialTime = 0,
  }: VideoPlayerControllerOptions = {},
): VideoPlayer {
  const player = useVideoPlayer(getCachedVideoSource(source), (createdPlayer) => {
    createdPlayer.muted = muted;
    createdPlayer.loop = loop;
    createdPlayer.timeUpdateEventInterval = timeUpdateInterval;
    if (initialTime > 0.5) {
      createdPlayer.currentTime = initialTime;
    }
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  useEffect(() => {
    player.timeUpdateEventInterval = timeUpdateInterval;
  }, [player, timeUpdateInterval]);

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, shouldPlay]);

  return player;
}
