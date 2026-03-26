import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useTimeTickStore } from "@/src/stores";
import { storage } from "@/src/stores/mmkv-storage";

const APP_WAS_BACKGROUNDED_KEY = "app_was_backgrounded";
const APP_LAST_FOREGROUND_TIME_KEY = "app_last_foreground_time";
const DEFAULT_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

type UseFeedResumeRefreshOptions = {
  onFreshResume: () => void | Promise<void>;
  onStaleResume: () => void | Promise<void>;
  staleThresholdMs?: number;
  freshDelayMs?: number;
  staleDelayMs?: number;
  restorePersistedBackground?: boolean;
};

export function useFeedResumeRefresh({
  onFreshResume,
  onStaleResume,
  staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
  freshDelayMs = 500,
  staleDelayMs = 300,
  restorePersistedBackground = false,
}: UseFeedResumeRefreshOptions) {
  const isFocused = useIsFocused();
  const backgroundTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFreshResumeRef = useRef(onFreshResume);
  const onStaleResumeRef = useRef(onStaleResume);
  const isFocusedRef = useRef(isFocused);

  onFreshResumeRef.current = onFreshResume;
  onStaleResumeRef.current = onStaleResume;
  isFocusedRef.current = isFocused;

  const clearScheduledResume = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const scheduleResume = useCallback(
    (duration: number) => {
      clearScheduledResume();
      useTimeTickStore.getState().bump();

      const callback =
        duration >= staleThresholdMs
          ? onStaleResumeRef.current
          : onFreshResumeRef.current;
      const delay = duration >= staleThresholdMs ? staleDelayMs : freshDelayMs;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void callback();
      }, delay);
    },
    [clearScheduledResume, freshDelayMs, staleDelayMs, staleThresholdMs],
  );

  useEffect(() => {
    if (!restorePersistedBackground || !isFocused) return;

    const wasBackgrounded = storage.getString(APP_WAS_BACKGROUNDED_KEY);
    if (!wasBackgrounded) return;

    storage.remove(APP_WAS_BACKGROUNDED_KEY);
    const lastForegroundTime = Number(
      storage.getString(APP_LAST_FOREGROUND_TIME_KEY) ?? "0",
    );
    if (!lastForegroundTime) return;

    scheduleResume(Date.now() - lastForegroundTime);
  }, [isFocused, restorePersistedBackground, scheduleResume]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (!isFocusedRef.current) return;

      if (nextState === "background" || nextState === "inactive") {
        if (!backgroundTimeRef.current) {
          backgroundTimeRef.current = Date.now();
          storage.set(APP_WAS_BACKGROUNDED_KEY, "true");
          storage.set(
            APP_LAST_FOREGROUND_TIME_KEY,
            backgroundTimeRef.current.toString(),
          );
        }
        return;
      }

      if (nextState === "active" && backgroundTimeRef.current) {
        const duration = Date.now() - backgroundTimeRef.current;
        backgroundTimeRef.current = null;
        storage.remove(APP_WAS_BACKGROUNDED_KEY);
        scheduleResume(duration);
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      clearScheduledResume();
      subscription.remove();
    };
  }, [clearScheduledResume, scheduleResume]);

  useEffect(
    () => () => {
      clearScheduledResume();
    },
    [clearScheduledResume],
  );
}
