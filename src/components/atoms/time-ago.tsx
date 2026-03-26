import { Text, type TextProps } from "@/src/components/ui/primitives";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

type TimeAgoProps = Omit<TextProps, "children"> & {
  timestamp: Date | string | number;
  showSuffix?: boolean;
  verbose?: boolean;
};

const TIME_UNITS = [
  { unit: "y", full: "year", seconds: 31536000 },
  { unit: "mo", full: "month", seconds: 2592000 },
  { unit: "w", full: "week", seconds: 604800 },
  { unit: "d", full: "day", seconds: 86400 },
  { unit: "h", full: "hour", seconds: 3600 },
  { unit: "m", full: "minute", seconds: 60 },
  { unit: "s", full: "second", seconds: 1 },
] as const;

const SHARED_TICK_INTERVAL_MS = 30_000;

let currentTick = Date.now();
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
const listeners = new Set<() => void>();

function emitTick() {
  currentTick = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function ensureTickingStarted() {
  if (intervalHandle) {
    return;
  }

  emitTick();
  intervalHandle = setInterval(emitTick, SHARED_TICK_INTERVAL_MS);
  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      emitTick();
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureTickingStarted();

  return () => {
    listeners.delete(listener);
    if (listeners.size !== 0) {
      return;
    }

    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    appStateSubscription?.remove();
    appStateSubscription = null;
  };
}

function getSnapshot() {
  return currentTick;
}

function useSharedTimeTick() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function formatTimeAgo(
  timestamp: Date | string | number,
  nowMs: number,
  showSuffix: boolean,
  verbose: boolean,
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const diffInSeconds = Math.floor((nowMs - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return verbose ? "just now" : "now";
  }

  if (diffInSeconds < 10) {
    return verbose ? "just now" : "now";
  }

  for (const { unit, full, seconds } of TIME_UNITS) {
    const value = Math.floor(diffInSeconds / seconds);
    if (value < 1) {
      continue;
    }

    if (verbose) {
      const suffix = showSuffix ? " ago" : "";
      const plural = value === 1 ? "" : "s";
      return `${value} ${full}${plural}${suffix}`;
    }

    return `${value}${unit}${showSuffix ? " ago" : ""}`;
  }

  return verbose ? "just now" : "now";
}

export const TimeAgo = ({
  timestamp,
  showSuffix = true,
  verbose = false,
  size = "sm",
  mode = "subtle",
  ...textProps
}: TimeAgoProps) => {
  const tick = useSharedTimeTick();
  const timeAgoText = formatTimeAgo(timestamp, tick, showSuffix, verbose);

  return (
    <Text size={size} mode={mode} {...textProps}>
      {timeAgoText}
    </Text>
  );
};

export const useTimeAgo = (
  timestamp: Date | string | number,
  options?: { showSuffix?: boolean; verbose?: boolean },
): string => {
  const tick = useSharedTimeTick();
  const { showSuffix = true, verbose = false } = options ?? {};
  return formatTimeAgo(timestamp, tick, showSuffix, verbose);
};
