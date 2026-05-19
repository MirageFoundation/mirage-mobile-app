import { useCallback, useEffect, useRef, useState } from "react";

import { useVideoMuteStore } from "@/src/stores";
import {
  enableIosAudioPlayback,
  type MediaItem,
  type VideoApi,
} from "./media-post-detail-media-item";

export function useMediaPostDetailVideoControls(mediaItems: MediaItem[]) {
  const globalMuted = useVideoMuteStore((state) => state.isMuted);
  const toggleGlobalMute = useVideoMuteStore((state) => state.toggleMute);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMedia = mediaItems[activeIndex];
  const isVideoActive = activeMedia?.type === "video";
  const videoApisRef = useRef<Map<string, VideoApi>>(new Map());

  const registerVideo = useCallback((key: string, api: VideoApi | null) => {
    if (api) videoApisRef.current.set(key, api);
    else videoApisRef.current.delete(key);
  }, []);

  const activeVideoApi = useCallback(() => {
    if (!isVideoActive) return null;
    return videoApisRef.current.get(`m-${activeIndex}`) ?? null;
  }, [activeIndex, isVideoActive]);

  const [activeStatus, setActiveStatus] = useState({
    position: 0,
    duration: 0,
    playing: true,
  });

  useEffect(() => {
    if (!isVideoActive) return;
    const timer = setInterval(() => {
      const api = activeVideoApi();
      if (!api) return;
      const position = api.getPosition();
      const duration = api.getDuration();
      const playing = api.isPlaying();
      setActiveStatus((prev) =>
        prev.position === position &&
        prev.duration === duration &&
        prev.playing === playing
          ? prev
          : { position, duration, playing },
      );
    }, 250);
    return () => clearInterval(timer);
  }, [activeMedia?.uri, activeVideoApi, isVideoActive]);

  const handleMuteToggle = useCallback(async () => {
    const next = !globalMuted;
    toggleGlobalMute();
    if (!next) {
      await enableIosAudioPlayback();
    }
    activeVideoApi()?.setMuted(next).catch(() => {});
  }, [activeVideoApi, globalMuted, toggleGlobalMute]);

  const handlePlayPause = useCallback(() => {
    activeVideoApi()?.toggle();
  }, [activeVideoApi]);

  const handleSeek = useCallback((ms: number) => {
    activeVideoApi()?.seek(ms);
  }, [activeVideoApi]);

  return {
    activeIndex,
    activeMedia,
    activeStatus,
    globalMuted,
    handleMuteToggle,
    handlePlayPause,
    handleSeek,
    isVideoActive,
    registerVideo,
    setActiveIndex,
  };
}
