import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { AppState } from "react-native";
import { Text, type TextProps } from "@/src/components/ui/primitives";
import { useTimeTickStore } from "@/src/stores";

type TimeAgoProps = Omit<TextProps, "children"> & {
  /** Timestamp to display (Date, ISO string, or Unix timestamp in ms) */
  timestamp: Date | string | number;
  /** Whether to show "ago" suffix */
  showSuffix?: boolean;
  /** Whether to show full text (e.g., "2 hours ago" vs "2h") */
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

function formatTimeAgo(
  timestamp: Date | string | number,
  showSuffix: boolean,
  verbose: boolean,
): string {
  const date = timestamp instanceof Date
    ? timestamp
    : new Date(timestamp);

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return verbose ? "just now" : "now";
  }

  if (diffInSeconds < 10) {
    return verbose ? "just now" : "now";
  }

  for (const { unit, full, seconds } of TIME_UNITS) {
    const value = Math.floor(diffInSeconds / seconds);
    if (value >= 1) {
      if (verbose) {
        const suffix = showSuffix ? " ago" : "";
        const plural = value === 1 ? "" : "s";
        return `${value} ${full}${plural}${suffix}`;
      }
      return `${value}${unit}${showSuffix ? " ago" : ""}`;
    }
  }

  return verbose ? "just now" : "now";
}

function getRefreshInterval(timestamp: Date | string | number): number {
  const date = timestamp instanceof Date
    ? timestamp
    : new Date(timestamp);
  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 10_000;
  if (diffInSeconds < 3600) return 60_000;
  return 300_000;
}

function useTick(timestamp: Date | string | number) {
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useTimeTickStore((s) => s.tick);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = getRefreshInterval(timestamp);
    intervalRef.current = setInterval(() => setTick((t) => t + 1), ms);
  }, [timestamp]);

  useEffect(() => {
    startTimer();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setTick((t) => t + 1);
        startTimer();
      }
    });
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [startTimer]);
}

export const TimeAgo = ({
  timestamp,
  showSuffix = true,
  verbose = false,
  size = "sm",
  mode = "subtle",
  ...textProps
}: TimeAgoProps) => {
  useTick(timestamp);
  const timeAgoText = formatTimeAgo(timestamp, showSuffix, verbose);

  return (
    <Text size={size} mode={mode} {...textProps}>
      {timeAgoText}
    </Text>
  );
};

/**
 * Hook to get time ago string (useful when you need just the string)
 */
export const useTimeAgo = (
  timestamp: Date | string | number,
  options?: { showSuffix?: boolean; verbose?: boolean }
): string => {
  const { showSuffix = true, verbose = false } = options ?? {};
  useTick(timestamp);
  return formatTimeAgo(timestamp, showSuffix, verbose);
};
