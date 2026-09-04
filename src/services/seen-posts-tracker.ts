import { AppState } from "react-native";
import * as Sentry from "@sentry/react-native";
import { markSeen } from "./seen-posts";
import {
  SEEN_TRACKER_MAX_EXPOSURES,
  needsSeenExposurePrune,
  shouldDropEndedExposure,
} from "./seen-posts-tracker-policy";

const DWELL_THRESHOLD_MS = 3_000;
const GLANCE_THRESHOLD_MS = 250;
const GLANCE_MIN_EXPOSURES = 2;

type SeenEmitReason = "dwell" | "glance";

export type SeenPostVisibility = {
  id: string;
  title?: string;
  glanceVisible: boolean;
  dwellVisible: boolean;
};

type PostExposureState = {
  glanceCount: number;
  dwellTimer: ReturnType<typeof setTimeout> | null;
  glanceTimer: ReturnType<typeof setTimeout> | null;
  glanceQualified: boolean;
  markedDuringCurrentExposure: boolean;
};

type SeenTrackerState = {
  exposureMap: Map<string, PostExposureState>;
  visiblePostIds: Set<string>;
  lastVisibilityMap: Map<string, SeenPostVisibility>;
};

const trackerStateMap = new Map<string, SeenTrackerState>();
let trackedSeenEmitCount = 0;

function addSeenEmitBreadcrumb(postId: string, reason: SeenEmitReason, glanceCount: number): void {
  trackedSeenEmitCount += 1;
  if (trackedSeenEmitCount > 5 && trackedSeenEmitCount % 25 !== 0) return;

  Sentry.addBreadcrumb({
    category: "seen-posts",
    message: `Tracked seen post via ${reason}`,
    level: "info",
    data: {
      reason,
      glanceCount,
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
      glanceCount: 0,
      dwellTimer: null,
      glanceTimer: null,
      glanceQualified: false,
      markedDuringCurrentExposure: false,
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

function clearAllTimers(state: PostExposureState): void {
  clearGlanceTimer(state);
  clearDwellTimer(state);
}

function dropExposure(trackerState: SeenTrackerState, postId: string): void {
  const state = trackerState.exposureMap.get(postId);
  if (state) clearAllTimers(state);
  trackerState.exposureMap.delete(postId);
  trackerState.lastVisibilityMap.delete(postId);
  trackerState.visiblePostIds.delete(postId);
}

function pruneExposureMap(trackerState: SeenTrackerState): void {
  if (!needsSeenExposurePrune(trackerState.exposureMap.size)) return;

  for (const [postId, state] of trackerState.exposureMap) {
    if (trackerState.visiblePostIds.has(postId)) continue;
    if (state.dwellTimer || state.glanceTimer) continue;
    dropExposure(trackerState, postId);
    if (trackerState.exposureMap.size <= SEEN_TRACKER_MAX_EXPOSURES) return;
  }

  for (const postId of trackerState.exposureMap.keys()) {
    if (trackerState.visiblePostIds.has(postId)) continue;
    dropExposure(trackerState, postId);
    if (trackerState.exposureMap.size <= SEEN_TRACKER_MAX_EXPOSURES) return;
  }
}

function markPostSeen(trackerKey: string, postId: string, reason: SeenEmitReason): void {
  const trackerState = getTrackerState(trackerKey);
  const state = trackerState.exposureMap.get(postId);
  const glanceCount = state?.glanceCount ?? 0;

  if (state) {
    state.markedDuringCurrentExposure = true;
    state.glanceQualified = false;
    state.glanceCount = 0;
    clearAllTimers(state);
  }

  markSeen(postId, reason, trackerState.lastVisibilityMap.get(postId)?.title);
  addSeenEmitBreadcrumb(postId, reason, glanceCount);
  dropExposure(trackerState, postId);
}

function startGlanceTimer(trackerKey: string, postId: string): void {
  if (AppState.currentState !== "active") return;

  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);
  if (state.markedDuringCurrentExposure || state.glanceQualified || state.glanceTimer) return;

  state.glanceTimer = setTimeout(() => {
    state.glanceTimer = null;
    if (AppState.currentState !== "active") return;
    const latestVisibility = trackerState.lastVisibilityMap.get(postId);
    if (!latestVisibility?.glanceVisible) return;
    state.glanceQualified = true;
  }, GLANCE_THRESHOLD_MS);
}

function startDwellTimer(trackerKey: string, postId: string): void {
  if (AppState.currentState !== "active") return;

  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);
  if (state.markedDuringCurrentExposure || state.dwellTimer) return;

  state.dwellTimer = setTimeout(() => {
    state.dwellTimer = null;
    if (AppState.currentState !== "active") return;
    const latestVisibility = trackerState.lastVisibilityMap.get(postId);
    if (!latestVisibility?.dwellVisible) return;
    markPostSeen(trackerKey, postId, "dwell");
  }, DWELL_THRESHOLD_MS);
}

function beginExposure(trackerKey: string, postId: string, visibility: SeenPostVisibility): void {
  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);

  state.markedDuringCurrentExposure = false;
  state.glanceQualified = false;
  clearAllTimers(state);
  trackerState.lastVisibilityMap.set(postId, visibility);

  if (visibility.glanceVisible) {
    startGlanceTimer(trackerKey, postId);
  }
  if (visibility.dwellVisible) {
    startDwellTimer(trackerKey, postId);
  }
}

function endExposure(trackerKey: string, postId: string): void {
  const trackerState = getTrackerState(trackerKey);
  const state = trackerState.exposureMap.get(postId);
  trackerState.lastVisibilityMap.delete(postId);

  if (!state) return;

  clearAllTimers(state);

  if (!state.markedDuringCurrentExposure && state.glanceQualified) {
    const nextGlanceCount = state.glanceCount + 1;
    state.glanceCount = nextGlanceCount;
    if (nextGlanceCount >= GLANCE_MIN_EXPOSURES) {
      markPostSeen(trackerKey, postId, "glance");
      return;
    }
  }

  state.glanceQualified = false;
  state.markedDuringCurrentExposure = false;
  if (shouldDropEndedExposure(state.glanceCount)) {
    dropExposure(trackerState, postId);
  }
  pruneExposureMap(trackerState);
}

function updateExposure(trackerKey: string, postId: string, visibility: SeenPostVisibility): void {
  const trackerState = getTrackerState(trackerKey);
  const state = getOrCreate(trackerKey, postId);

  trackerState.lastVisibilityMap.set(postId, visibility);

  if (!visibility.glanceVisible) {
    endExposure(trackerKey, postId);
    return;
  }

  if (!state.markedDuringCurrentExposure) {
    startGlanceTimer(trackerKey, postId);
    if (visibility.dwellVisible) {
      startDwellTimer(trackerKey, postId);
    } else {
      clearDwellTimer(state);
    }
  }
}

export function recordViewableItems(items: SeenPostVisibility[], trackerKey?: string): void {
  const normalizedTrackerKey = normalizeTrackerKey(trackerKey);
  const trackerState = getTrackerState(normalizedTrackerKey);
  const previousVisiblePostIds = new Set(trackerState.visiblePostIds);
  const nextVisiblePostIds = new Set<string>();

  for (const item of items) {
    const postId = normalizePostId(item.id);
    if (!postId) continue;

    const visibility = {
      id: postId,
      title: item.title,
      glanceVisible: item.glanceVisible,
      dwellVisible: item.dwellVisible,
    };

    nextVisiblePostIds.add(postId);
    if (previousVisiblePostIds.has(postId)) {
      updateExposure(normalizedTrackerKey, postId, visibility);
    } else {
      beginExposure(normalizedTrackerKey, postId, visibility);
    }
  }

  for (const postId of previousVisiblePostIds) {
    if (!nextVisiblePostIds.has(postId)) {
      endExposure(normalizedTrackerKey, postId);
    }
  }

  trackerState.visiblePostIds = nextVisiblePostIds;
  for (const trackedPostId of Array.from(trackerState.lastVisibilityMap.keys())) {
    if (!nextVisiblePostIds.has(trackedPostId)) {
      trackerState.lastVisibilityMap.delete(trackedPostId);
    }
  }
}

export function pauseAllDwellTimers(trackerKey?: string): void {
  const keys = trackerKey
    ? [normalizeTrackerKey(trackerKey)]
    : Array.from(trackerStateMap.keys());

  for (const key of keys) {
    const trackerState = getTrackerState(key);
    for (const state of trackerState.exposureMap.values()) {
      clearAllTimers(state);
      state.glanceQualified = false;
      state.markedDuringCurrentExposure = false;
    }
    trackerState.lastVisibilityMap.clear();
  }
}

export function resumeDwellTimers(_trackerKey?: string): void {}

export function resetSeenPostTracking(trackerKey?: string): void {
  const keys = trackerKey
    ? [normalizeTrackerKey(trackerKey)]
    : Array.from(trackerStateMap.keys());

  for (const key of keys) {
    const trackerState = trackerStateMap.get(key);
    if (!trackerState) continue;
    for (const state of trackerState.exposureMap.values()) {
      clearAllTimers(state);
    }
    trackerStateMap.delete(key);
  }
}

export function getVisiblePostIds(trackerKeys?: string[]): string[] {
  const keys = trackerKeys && trackerKeys.length > 0
    ? trackerKeys.map((key) => normalizeTrackerKey(key))
    : Array.from(trackerStateMap.keys());

  const visibleIds = new Set<string>();
  for (const key of keys) {
    const trackerState = getTrackerState(key);
    for (const postId of trackerState.visiblePostIds) {
      visibleIds.add(postId);
    }
  }

  return Array.from(visibleIds);
}
