import { AppState } from "react-native";
import { markSeen } from "./seen-posts";

const DWELL_THRESHOLD_MS = 3_000;
const GLANCE_MIN_EXPOSURES = 2;

type PostExposureState = {
  exposureCount: number;
  dwellTimer: ReturnType<typeof setTimeout> | null;
  seen: boolean;
};

const exposureMap = new Map<string, PostExposureState>();
const visiblePostIds = new Set<string>();

function getOrCreate(postId: string): PostExposureState {
  let state = exposureMap.get(postId);
  if (!state) {
    state = { exposureCount: 0, dwellTimer: null, seen: false };
    exposureMap.set(postId, state);
  }
  return state;
}

function markPostSeen(postId: string, reason: "dwell" | "glance"): void {
  const state = exposureMap.get(postId);
  if (!state || state.seen) return;
  state.seen = true;
  if (state.dwellTimer) {
    clearTimeout(state.dwellTimer);
    state.dwellTimer = null;
  }
  markSeen(postId, reason);
}

function startDwell(postId: string): void {
  if (AppState.currentState !== "active") return;
  const state = getOrCreate(postId);
  if (state.seen || state.dwellTimer) return;
  state.dwellTimer = setTimeout(() => {
    state.dwellTimer = null;
    markPostSeen(postId, "dwell");
  }, DWELL_THRESHOLD_MS);
}

function cancelDwell(postId: string): void {
  const state = exposureMap.get(postId);
  if (!state?.dwellTimer) return;
  clearTimeout(state.dwellTimer);
  state.dwellTimer = null;
}

export function recordViewableItems(viewablePostIds: string[]): void {
  if (AppState.currentState !== "active") return;

  const nowVisible = new Set<string>();

  for (const pid of viewablePostIds) {
    if (!pid) continue;
    nowVisible.add(pid);

    const state = getOrCreate(pid);
    if (state.seen) continue;

    state.exposureCount++;
    if (state.exposureCount >= GLANCE_MIN_EXPOSURES) {
      markPostSeen(pid, "glance");
      continue;
    }

    if (!state.dwellTimer) {
      startDwell(pid);
    }
  }

  for (const pid of visiblePostIds) {
    if (!nowVisible.has(pid)) {
      cancelDwell(pid);
    }
  }

  visiblePostIds.clear();
  for (const pid of nowVisible) {
    visiblePostIds.add(pid);
  }
}

export function pauseAllDwellTimers(): void {
  for (const [, state] of exposureMap) {
    if (state.dwellTimer) {
      clearTimeout(state.dwellTimer);
      state.dwellTimer = null;
    }
  }
}

export function resumeDwellTimers(): void {
  for (const pid of visiblePostIds) {
    startDwell(pid);
  }
}
