import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { VideoPlayer } from "expo-video";

import { isVideoPlayerControlledElsewhere, type VideoPlayerLease } from "@/src/utils/video-player-handoff";

import {
  nudgeVideoPlayerPlayback,
  resolveVideoForegroundRecovery,
} from "./video-foreground-recovery";

export function useVideoForegroundRecovery({
  sourceKey,
  shouldPlay,
  videoPlayer,
  adoptedLease,
  retryKey = 0,
  maxReloadAttempts,
  onReload,
  onRecoveryExhausted,
}: {
  sourceKey?: string | null;
  shouldPlay: boolean;
  videoPlayer: VideoPlayer;
  adoptedLease?: VideoPlayerLease | null;
  retryKey?: number;
  maxReloadAttempts?: number;
  onReload?: () => void;
  onRecoveryExhausted?: () => void;
}): void {
  const needsForegroundRecoveryRef = useRef(false);
  const foregroundReloadAttemptsRef = useRef(0);
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;
  const onRecoveryExhaustedRef = useRef(onRecoveryExhausted);
  onRecoveryExhaustedRef.current = onRecoveryExhausted;

  useEffect(() => {
    needsForegroundRecoveryRef.current = false;
    foregroundReloadAttemptsRef.current = 0;
  }, [sourceKey]);

  const recoverForegroundPlayback = useCallback(() => {
    let playerReady = false;
    try {
      playerReady = videoPlayer.status === "readyToPlay";
    } catch {
      return;
    }
    const action = resolveVideoForegroundRecovery({
      needsRecovery: needsForegroundRecoveryRef.current,
      isAppActive: AppState.currentState === "active",
      shouldPlay,
      playerReady,
      reloadAttempts: foregroundReloadAttemptsRef.current,
      maxReloadAttempts,
    });
    if (action === "wait") return;
    if (action === "idle") {
      if (needsForegroundRecoveryRef.current && shouldPlay && !playerReady) {
        onRecoveryExhaustedRef.current?.();
      }
      needsForegroundRecoveryRef.current = false;
      return;
    }
    if (isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease ?? null)) return;
    if (action === "nudge") {
      if (nudgeVideoPlayerPlayback(videoPlayer)) {
        needsForegroundRecoveryRef.current = false;
        foregroundReloadAttemptsRef.current = 0;
      }
      return;
    }
    foregroundReloadAttemptsRef.current += 1;
    onReloadRef.current?.();
  }, [adoptedLease, maxReloadAttempts, shouldPlay, videoPlayer]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState.match(/inactive|background/)) {
        needsForegroundRecoveryRef.current = true;
        return;
      }
      if (nextState !== "active") return;
      recoverForegroundPlayback();
    });
    return () => sub.remove();
  }, [recoverForegroundPlayback]);

  useEffect(() => {
    recoverForegroundPlayback();
  }, [recoverForegroundPlayback, retryKey]);
}
