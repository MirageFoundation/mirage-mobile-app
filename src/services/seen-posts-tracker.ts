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

type SeenTrackerState = {
  exposureMap: Map<string, PostExposureState>;
  visiblePostIds: Set<string>;
  lastVisibilityMap: Map<string, SeenPostVisibility>;
};

const trackerStateMap = new Map<string, SeenTrackerState>();
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

function normalizeTrackerKey(trackerKey?: string): string {
  return trackerKey?.trim().toLowerCase() || "default";
}

function getTrackerState(trackerKey?: string): SeenTrackerState {
  const normalizedKey = normalizeTrackerKey(trackerKey);
  let state = trackerStateMap.get(normalizedKey);
  if (!state) {
    state = {
      exposureMap: new Map<string, PostExposureState>(),
      visiblePostIds: new Set<string>(),
      lastVisibilityMap: new Map<string, SeenPostVisibility>(),
    };
    trackerStateMap.set(normalizedKey, state);
  }
  return state;
}

function getOrCreate(trackerKey: string, postId: string): PostExposureState {
  const trackerState = getTrackerState(trackerKey);
  let state = trackerState.exposureMap.get(postId);
  if (!state) {
    state = {
      exposureCount: 0,
      dwellTimer: null,
      glanceTimer: null,
      glanceQualified: false,
      seen: false,
    };
    trackerState.exposureMap.set(postId, state);
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

function markPostSeen(trackerKey: string, postId: string, reason: "dwell" | "glance"): void {
  const trackerState = getTrackerState(trackerKey);
  const state = trackerState.exposureMap.get(postId);
  if (!state || state.seen) return;

  state.seen = true;
  clearGlanceTimer(state);
  clearDwellTimer(state);
  markSeen(postId, reason);
  addSeenEmitBreadcrumb(postId, reason, state.exposureCount);
}

function startGlanceTimer(trackerKey: string, postId: string): void {
  if (AppState.currentState !== "active") return;

  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);
  if (state.seen || state.glanceQualified || state.glanceTimer) return;

  state.glanceTimer = setTimeout(() => {
    state.glanceTimer = null;
    const latestVisibility = trackerState.lastVisibilityMap.get(postId);
    if (!latestVisibility?.glanceVisible) return;
    state.glanceQualified = true;
  }, GLANCE_THRESHOLD_MS);
}

function startDwellTimer(trackerKey: string, postId: string): void {
  if (AppState.currentState !== "active") return;

  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);
  if (state.seen || state.dwellTimer) return;

  state.dwellTimer = setTimeout(() => {
    state.dwellTimer = null;
    const latestVisibility = trackerState.lastVisibilityMap.get(postId);
    if (!latestVisibility?.dwellVisible) return;
    markPostSeen(trackerKey, postId, "dwell");
  }, DWELL_THRESHOLD_MS);
}

function beginExposure(trackerKey: string, postId: string, visibility: SeenPostVisibility): void {
  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);
  if (state.seen) return;

  trackerState.lastVisibilityMap.set(postId, visibility);
  startGlanceTimer(trackerKey, postId);

  if (visibility.dwellVisible) {
    startDwellTimer(trackerKey, postId);
  }
}

function updateExposure(trackerKey: string, postId: string, visibility: SeenPostVisibility): void {
  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);
  if (state.seen) {
    trackerState.lastVisibilityMap.set(postId, visibility);
    return;
  }

  trackerState.lastVisibilityMap.set(postId, visibility);

  if (!visibility.glanceVisible) {
    endExposure(trackerKey, postId);
    return;
  }

  if (visibility.dwellVisible) {
    startDwellTimer(trackerKey, postId);
  } else {
    clearDwellTimer(state);
  }
}

function endExposure(trackerKey: string, postId: string): void {
  const trackerState = getTrackerState(trackerKey);
  const state = trackerState.exposureMap.get(postId);
  trackerState.lastVisibilityMap.delete(postId);

  if (!state) return;

  clearGlanceTimer(state);
  clearDwellTimer(state);

  if (!state.seen && state.glanceQualified) {
    state.exposureCount += 1;
    if (state.exposureCount >= GLANCE_MIN_EXPOSURES) {
      markPostSeen(trackerKey, postId, "glance");
    }
  }

  state.glanceQualified = false;
}

export function recordViewableItems(items: SeenPostVisibility[], trackerKey?: string): void {
  const normalizedTrackerKey = normalizeTrackerKey(trackerKey);
  const trackerState = getTrackerState(normalizedTrackerKey);
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

    if (!trackerState.visiblePostIds.has(postId)) {
      beginExposure(normalizedTrackerKey, postId, visibility);
      continue;
    }

    updateExposure(normalizedTrackerKey, postId, visibility);
  }

  for (const postId of trackerState.visiblePostIds) {
    if (!nextVisiblePostIds.has(postId)) {
      endExposure(normalizedTrackerKey, postId);
    }
  }

  trackerState.visiblePostIds.clear();
  for (const postId of nextVisiblePostIds) {
    trackerState.visiblePostIds.add(postId);
  }
}

export function pauseAllDwellTimers(trackerKey?: string): void {
  const trackerState = getTrackerState(trackerKey);
  for (const [, state] of trackerState.exposureMap) {
    clearGlanceTimer(state);
    clearDwellTimer(state);
    state.glanceQualified = false;
  }
}

export function resumeDwellTimers(trackerKey?: string): void {
  if (AppState.currentState !== "active") return;

  const normalizedTrackerKey = normalizeTrackerKey(trackerKey);
  const trackerState = getTrackerState(normalizedTrackerKey);
  for (const postId of trackerState.visiblePostIds) {
    const visibility = trackerState.lastVisibilityMap.get(postId);
    if (!visibility?.glanceVisible) continue;

    startGlanceTimer(normalizedTrackerKey, postId);
    if (visibility.dwellVisible) {
      startDwellTimer(normalizedTrackerKey, postId);
    }
  }
}
