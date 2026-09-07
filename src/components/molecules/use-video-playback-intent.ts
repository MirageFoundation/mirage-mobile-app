import { useLayoutEffect, useRef } from "react";
import type { VideoPlayer } from "expo-video";
import { getVideoPlaybackIntent, setVideoPlaybackIntent } from "@/src/utils/video-player-handoff";

export function useVideoPlaybackIntent(player: VideoPlayer, playing: boolean, active: boolean, controlledElsewhere: boolean, setPlaying: (playing: boolean) => void) {
  const wasBorrowed = useRef(false);
  const returning = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    if (controlledElsewhere) { wasBorrowed.current = true; return; }
    if (wasBorrowed.current) {
      wasBorrowed.current = false;
      returning.current = getVideoPlaybackIntent(player);
    }
    if (!active) return;
    if (returning.current !== null) {
      setPlaying(returning.current);
      return;
    }
    setVideoPlaybackIntent(player, playing);
  }, [player, playing, active, controlledElsewhere, setPlaying]);
  return returning;
}
