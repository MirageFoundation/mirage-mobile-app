import { useCallback, useEffect, useRef } from "react";
import { AppState, Dimensions, type ViewToken } from "react-native";
import { markSeen } from "@/src/services/seen-posts";
import { useAuthStore } from "@/src/stores";

const DWELL_THRESHOLD_MS = 3_000;
const DWELL_VISIBILITY_PERCENT = 50;
const GLANCE_VISIBILITY_PERCENT = 40;
const GLANCE_MIN_EXPOSURES = 2;

const ACTIVE_ZONE_TOP_EXCLUDE = 0.15;
const ACTIVE_ZONE_BOTTOM_EXCLUDE = 0.30;

type PostExposureState = {
  exposureCount: number;
  dwellTimer: ReturnType<typeof setTimeout> | null;
  dwellStartedAt: number | null;
  seen: boolean;
};

function isInActiveZone(
  itemTop: number,
  itemBottom: number,
  viewportHeight: number,
): boolean {
  const zoneTop = viewportHeight * ACTIVE_ZONE_TOP_EXCLUDE;
  const zoneBottom = viewportHeight * (1 - ACTIVE_ZONE_BOTTOM_EXCLUDE);
  const itemMid = (itemTop + itemBottom) / 2;
  return itemMid >= zoneTop && itemMid <= zoneBottom;
}

export function useSeenPostsTracker() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const exposureMapRef = useRef<Map<string, PostExposureState>>(new Map());
  const visiblePostIdsRef = useRef<Set<string>>(new Set());
  const isActiveRef = useRef(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const wasActive = isActiveRef.current;
      isActiveRef.current = nextState === "active";

      if (wasActive && !isActiveRef.current) {
        for (const [, state] of exposureMapRef.current) {
          if (state.dwellTimer) {
            clearTimeout(state.dwellTimer);
            state.dwellTimer = null;
            state.dwellStartedAt = null;
          }
        }
      }

      if (!wasActive && isActiveRef.current) {
        for (const postId of visiblePostIdsRef.current) {
          startDwellTimer(postId);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const getOrCreateState = useCallback((postId: string): PostExposureState => {
    let state = exposureMapRef.current.get(postId);
    if (!state) {
      state = {
        exposureCount: 0,
        dwellTimer: null,
        dwellStartedAt: null,
        seen: false,
      };
      exposureMapRef.current.set(postId, state);
    }
    return state;
  }, []);

  const markPostSeen = useCallback((postId: string, reason: "dwell" | "glance") => {
    const state = exposureMapRef.current.get(postId);
    if (!state || state.seen) return;
    state.seen = true;

    if (state.dwellTimer) {
      clearTimeout(state.dwellTimer);
      state.dwellTimer = null;
    }

    markSeen(postId, reason);
  }, []);

  const startDwellTimer = useCallback((postId: string) => {
    if (!isActiveRef.current) return;
    const state = getOrCreateState(postId);
    if (state.seen || state.dwellTimer) return;

    state.dwellStartedAt = Date.now();
    state.dwellTimer = setTimeout(() => {
      state.dwellTimer = null;
      state.dwellStartedAt = null;
      markPostSeen(postId, "dwell");
    }, DWELL_THRESHOLD_MS);
  }, [getOrCreateState, markPostSeen]);

  const cancelDwellTimer = useCallback((postId: string) => {
    const state = exposureMapRef.current.get(postId);
    if (!state) return;
    if (state.dwellTimer) {
      clearTimeout(state.dwellTimer);
      state.dwellTimer = null;
      state.dwellStartedAt = null;
    }
  }, []);

  const recordExposure = useCallback((postId: string) => {
    const state = getOrCreateState(postId);
    if (state.seen) return;
    state.exposureCount++;

    if (state.exposureCount >= GLANCE_MIN_EXPOSURES) {
      markPostSeen(postId, "glance");
    }
  }, [getOrCreateState, markPostSeen]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!isLoggedIn) return;
      if (!isActiveRef.current) return;

      const screenHeight = Dimensions.get("window").height;
      const nowVisible = new Set<string>();

      for (const item of viewableItems) {
        if (!item.isViewable) continue;
        const pid = item.item?.post_id ?? item.item?.id;
        if (!pid) continue;

        nowVisible.add(pid);

        const state = getOrCreateState(pid);
        if (state.seen) continue;

        recordExposure(pid);
      }

      for (const pid of visiblePostIdsRef.current) {
        if (!nowVisible.has(pid)) {
          cancelDwellTimer(pid);
        }
      }

      for (const pid of nowVisible) {
        const state = exposureMapRef.current.get(pid);
        if (state && !state.seen && !state.dwellTimer) {
          startDwellTimer(pid);
        }
      }

      visiblePostIdsRef.current = nowVisible;
    },
    [isLoggedIn, getOrCreateState, recordExposure, cancelDwellTimer, startDwellTimer],
  );

  useEffect(() => {
    return () => {
      for (const [, state] of exposureMapRef.current) {
        if (state.dwellTimer) {
          clearTimeout(state.dwellTimer);
        }
      }
      exposureMapRef.current.clear();
    };
  }, []);

  const seenViewabilityConfig = useRef({
    itemVisiblePercentThreshold: GLANCE_VISIBILITY_PERCENT,
    minimumViewTime: 500,
  }).current;

  return {
    onSeenViewableItemsChanged: onViewableItemsChanged,
    seenViewabilityConfig,
  };
}
