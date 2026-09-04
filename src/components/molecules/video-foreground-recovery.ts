import type { VideoPlayer } from "expo-video";

export const VIDEO_FOREGROUND_RELOAD_MAX = 2;

export type VideoForegroundRecoveryAction = "idle" | "wait" | "nudge" | "reload";

export function resolveVideoForegroundRecovery(state: {
  needsRecovery: boolean;
  isAppActive: boolean;
  shouldPlay: boolean;
  playerReady: boolean;
  reloadAttempts: number;
  maxReloadAttempts?: number;
}): VideoForegroundRecoveryAction {
  if (!state.needsRecovery) return "idle";
  if (!state.isAppActive || !state.shouldPlay) return "wait";
  if (state.playerReady) return "nudge";
  const maxReloads = state.maxReloadAttempts ?? VIDEO_FOREGROUND_RELOAD_MAX;
  if (maxReloads <= 0) return "wait";
  if (state.reloadAttempts < maxReloads) return "reload";
  return "idle";
}

export function nudgeVideoPlayerPlayback(player: VideoPlayer): boolean {
  try {
    if (player.status !== "readyToPlay") return false;
    const position = player.currentTime;
    player.currentTime = position;
    player.play();
    return true;
  } catch {
    // Native player already released; callers recreate via mount gates.
    return false;
  }
}
