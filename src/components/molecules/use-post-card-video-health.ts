import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoPlayer } from "expo-video";
import { AppState } from "react-native";
import { isHostedStreamVideoUrl, type ResolvedMedia } from "./post-card-utils";
import { HLS_PROCESSING_POLL_INTERVAL_MS, isHlsManifestReady } from "@/src/utils/hls-manifest";
import { BoundedLruSet } from "@/src/utils/bounded-lru";
import { isVideoPlayerControlledElsewhere, type VideoPlayerLease } from "@/src/utils/video-player-handoff";
import { useVideoSourceRecovery } from "./use-video-source-recovery";
import { useVideoPlayerLeaseVersion } from "@/src/hooks/use-video-player-controller";

export const HOSTED_VIDEO_READY_CACHE = new BoundedLruSet<string>(256);
const COMPLETED_PROCESSING_POST_IDS = new BoundedLruSet<string>(256);
export const VIDEO_PROCESSING_POLL_MAX_MS = 5 * 60 * 1000;

export function usePostCardVideoHealth({
  media, videoPlayer, adoptedLease, enabled, shouldPlay,
  forceVideoProcessing, processingMediaUri, onVideoProcessingComplete, postId,
}: {
  media: ResolvedMedia;
  videoPlayer: VideoPlayer;
  adoptedLease: VideoPlayerLease | null;
  enabled: boolean;
  shouldPlay: boolean;
  forceVideoProcessing: boolean;
  processingMediaUri?: string;
  onVideoProcessingComplete?: () => void;
  postId?: string;
}) {
  const [processingState, setProcessingState] = useState<"polling" | "ready" | "expired">("polling");
  const processing = forceVideoProcessing && processingState !== "ready";
  const recovery = useVideoSourceRecovery({ uri: media.uri, player: videoPlayer, lease: adoptedLease, enabled, shouldPlay: shouldPlay && !processing, processing });
  const { retry: retrySource, firstFrame } = recovery;
  const leaseVersion = useVideoPlayerLeaseVersion();
  const [pollEpisode, setPollEpisode] = useState(0);
  const startedAt = useRef<number | null>(null);
  const processingTargetUri = processingMediaUri ?? media.uri;
  const isHostedStreamVideo = isHostedStreamVideoUrl(processingTargetUri);
  const showVideoProcessing = forceVideoProcessing && processingState === "polling";
  const reportVideoProcessingComplete = useCallback(() => {
    const key = postId ?? processingTargetUri;
    if (COMPLETED_PROCESSING_POST_IDS.has(key)) return;
    COMPLETED_PROCESSING_POST_IDS.add(key);
    onVideoProcessingComplete?.();
  }, [onVideoProcessingComplete, postId, processingTargetUri]);
  useEffect(() => {
    startedAt.current = null;
    setProcessingState("polling");
  }, [processingTargetUri]);
  useEffect(() => {
    if (!showVideoProcessing || !enabled) return;
    if (isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) return;
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (startedAt.current === null) startedAt.current = Date.now();
    const expire = () => {
      if (cancelled || AppState.currentState !== "active" || isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) return;
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      setProcessingState("expired");
    };
    const deadline = setTimeout(expire, Math.max(0, VIDEO_PROCESSING_POLL_MAX_MS - (Date.now() - startedAt.current)));
    const poll = async () => {
      if (cancelled || AppState.currentState !== "active" || isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) return;
      const ready = isHostedStreamVideo && await isHlsManifestReady(processingTargetUri, controller.signal).catch(() => false);
      if (cancelled || AppState.currentState !== "active" || isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) return;
      if (ready) {
        clearTimeout(deadline);
        HOSTED_VIDEO_READY_CACHE.add(processingTargetUri);
        setProcessingState("ready");
        reportVideoProcessingComplete();
        retrySource();
      } else {
        timer = setTimeout(() => { void poll(); }, HLS_PROCESSING_POLL_INTERVAL_MS);
      }
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); clearTimeout(deadline); }
      else setPollEpisode((value) => value + 1);
    });
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(deadline); if (timer) clearTimeout(timer); sub.remove(); };
  }, [adoptedLease, enabled, isHostedStreamVideo, leaseVersion, pollEpisode, processingTargetUri, retrySource, reportVideoProcessingComplete, showVideoProcessing, videoPlayer]);
  const retry = useCallback(() => {
    startedAt.current = null;
    setProcessingState("polling");
    setPollEpisode((value) => value + 1);
    retrySource();
  }, [retrySource]);
  const handleFirstFrameHealth = useCallback(() => {
    if (!firstFrame()) return false;
    if (media.uri === processingTargetUri && isHostedStreamVideo) {
      HOSTED_VIDEO_READY_CACHE.add(processingTargetUri);
      setProcessingState("ready");
      if (forceVideoProcessing) reportVideoProcessingComplete();
    }
    return true;
  }, [forceVideoProcessing, isHostedStreamVideo, media.uri, processingTargetUri, firstFrame, reportVideoProcessingComplete]);
  return {
    ...recovery,
    retry,
    isRedgifsVideo: media.uri.includes("redgifs.com"),
    showVideoProcessing,
    videoError: processingState === "expired" || (!showVideoProcessing && recovery.phase === "terminal"),
    handleFirstFrameHealth,
  };
}
