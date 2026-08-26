import { memo } from "react";
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

export const TimeAgo = memo(function TimeAgo({
  timestamp,
  showSuffix = true,
  verbose = false,
  size = "sm",
  mode = "subtle",
  ...textProps
}: TimeAgoProps) {
  useTimeTickStore((s) => s.tick);
  const timeAgoText = formatTimeAgo(timestamp, showSuffix, verbose);

  return (
    <Text size={size} mode={mode} {...textProps}>
      {timeAgoText}
    </Text>
  );
});

/**
 * Hook to get time ago string (useful when you need just the string)
 */
export const useTimeAgo = (
  timestamp: Date | string | number,
  options?: { showSuffix?: boolean; verbose?: boolean }
): string => {
  const { showSuffix = true, verbose = false } = options ?? {};
  useTimeTickStore((s) => s.tick);
  return formatTimeAgo(timestamp, showSuffix, verbose);
};
