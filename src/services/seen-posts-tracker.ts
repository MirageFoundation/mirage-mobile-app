import { AppState } from "react-native";
import * as Sentry from "@sentry/react-native";
import { markSeen } from "./seen-posts";

const DWELL_THRESHOLD_MS = 3_000;
const GLANCE_THRESHOLD_MS = 150;
const GLANCE_MIN_EXPOSURES = 2;

export type SeenPostVisibility = {
  id: string;
  glanceVisible: boolean;
  dwellVisible: boolean;
};

type PostExposureState = {
  exposureCount: number;
  dwellTimer: ReturnType<typeof setTimeout> | null;
  glanceTimer: ReturnType<typeof setTimeout> | null;
  glanceQualified: boolean;
  seen: boolean;
};

const exposureMap = new Map<string, PostExposureState>();
const visiblePostIds = new Set<string>();
const lastVisibilityMap = new Map<string, SeenPostVisibility>();
let trackedSeenEmitCount = 0;

function addSeenEmitBreadcrumb(postId: string, reason: "dwell" | "glance", exposureCount: number): void {
  trackedSeenEmitCount += 1;
  if (trackedSeenEmitCount > 5 && trackedSeenEmitCount % 25 !== 0) return;

  Sentry.addBreadcrumb({
    category: "seen-posts",
    message: `Tracked seen post via ${reason}`,
    level: "info",
    data: {
      reason,
      exposureCount,
      trackedSeenEmitCount,
      postIdPrefix: postId.slice(0, 12),
    },
  });
}

function normalizePostId(postId: string): string {
  return postId.trim().toLowerCase();
}

function getOrCreate(postId: string): PostExposureState {
  let state = exposureMap.get(postId);
  if (!state) {
    state = {
      exposureCount: 0,
      dwellTimer: null,
      glanceTimer: null,
      glanceQualified: false,
      seen: false,
    };
    exposureMap.set(postId, state);
  }
  return state;
}

function clearGlanceTimer(state: PostExposureState): void {
  if (!state.glanceTimer) return;
  clearTimeout(state.glanceTimer);
  state.glanceTimer = null;
}

function clearDwellTimer(state: PostExposureState): void {
  if (!state.dwellTimer) return;
  clearTimeout(state.dwellTimer);
  state.dwellTimer = null;
}

function markPostSeen(postId: string, reason: "dwell" | "glance"): void {
  const state = exposureMap.get(postId);
  if (!state || state.seen) return;

  state.seen = true;
  clearGlanceTimer(state);
  clearDwellTimer(state);
  markSeen(postId, reason);
  addSeenEmitBreadcrumb(postId, reason, state.exposureCount);
}

function startGlanceTimer(postId: string): void {
  if (AppState.currentState !== "active") return;

  const state = getOrCreate(postId);
  if (state.seen || state.glanceQualified || state.glanceTimer) return;

  state.glanceTimer = setTimeout(() => {
    state.glanceTimer = null;
    const latestVisibility = lastVisibilityMap.get(postId);
    if (!latestVisibility?.glanceVisible) return;
    state.glanceQualified = true;
  }, GLANCE_THRESHOLD_MS);
}

function startDwellTimer(postId: string): void {
  if (AppState.currentState !== "active") return;

  const state = getOrCreate(postId);
  if (state.seen || state.dwellTimer) return;

  state.dwellTimer = setTimeout(() => {
    state.dwellTimer = null;
    const latestVisibility = lastVisibilityMap.get(postId);
    if (!latestVisibility?.dwellVisible) return;
    markPostSeen(postId, "dwell");
  }, DWELL_THRESHOLD_MS);
}

function beginExposure(postId: string, visibility: SeenPostVisibility): void {
  const state = getOrCreate(postId);
  if (state.seen) return;

  lastVisibilityMap.set(postId, visibility);
  startGlanceTimer(postId);

  if (visibility.dwellVisible) {
    startDwellTimer(postId);
  }
}

function updateExposure(postId: string, visibility: SeenPostVisibility): void {
  const state = getOrCreate(postId);
  if (state.seen) {
    lastVisibilityMap.set(postId, visibility);
    return;
  }

  lastVisibilityMap.set(postId, visibility);

  if (!visibility.glanceVisible) {
    endExposure(postId);
    return;
  }

  if (visibility.dwellVisible) {
    startDwellTimer(postId);
  } else {
    clearDwellTimer(state);
  }
}

function endExposure(postId: string): void {
  const state = exposureMap.get(postId);
  lastVisibilityMap.delete(postId);

  if (!state) return;

  clearGlanceTimer(state);
  clearDwellTimer(state);

  if (!state.seen && state.glanceQualified) {
    state.exposureCount += 1;
    if (state.exposureCount >= GLANCE_MIN_EXPOSURES) {
      markPostSeen(postId, "glance");
    }
  }

  state.glanceQualified = false;
}

export function recordViewableItems(items: SeenPostVisibility[]): void {
  const nextVisiblePostIds = new Set<string>();

  for (const item of items) {
    const postId = normalizePostId(item.id);
    if (!postId || !item.glanceVisible) continue;

    const visibility = {
      id: postId,
      glanceVisible: item.glanceVisible,
      dwellVisible: item.dwellVisible,
    };

    nextVisiblePostIds.add(postId);

    if (!visiblePostIds.has(postId)) {
      beginExposure(postId, visibility);
      continue;
    }

    updateExposure(postId, visibility);
  }

  for (const postId of visiblePostIds) {
    if (!nextVisiblePostIds.has(postId)) {
      endExposure(postId);
    }
  }

  visiblePostIds.clear();
  for (const postId of nextVisiblePostIds) {
    visiblePostIds.add(postId);
  }
}

export function pauseAllDwellTimers(): void {
  for (const [, state] of exposureMap) {
    clearGlanceTimer(state);
    clearDwellTimer(state);
    state.glanceQualified = false;
  }
}

export function resumeDwellTimers(): void {
  if (AppState.currentState !== "active") return;

  for (const postId of visiblePostIds) {
    const visibility = lastVisibilityMap.get(postId);
    if (!visibility?.glanceVisible) continue;

    startGlanceTimer(postId);
    if (visibility.dwellVisible) {
      startDwellTimer(postId);
    }
  }
}
