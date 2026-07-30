import { Platform } from "react-native";

/**
 * Direction-aware warm window for feed video players.
 *
 * Prepared ("warm") players cost native memory, so instead of warming a
 * symmetric window around the viewport we keep more players ahead in the
 * scroll direction and only one behind. Android is tighter than iOS.
 */
export const VIDEO_WARM_AHEAD = Platform.OS === "ios" ? 3 : 2;
export const VIDEO_WARM_BEHIND = 1;

export type FeedScrollDirection = "forward" | "backward";

export type ScrollDirectionTracker = {
  update: (minVisibleIndex: number) => FeedScrollDirection;
  reset: () => void;
};

/**
 * Tracks scroll direction from successive minimum visible list indices.
 * Keeps the previous direction while the index is unchanged.
 */
export function createScrollDirectionTracker(
  initial: FeedScrollDirection = "forward",
): ScrollDirectionTracker {
  let lastMinIndex: number | null = null;
  let direction: FeedScrollDirection = initial;
  return {
    update(minVisibleIndex: number): FeedScrollDirection {
      if (lastMinIndex !== null && minVisibleIndex !== lastMinIndex) {
        direction = minVisibleIndex > lastMinIndex ? "forward" : "backward";
      }
      lastMinIndex = minVisibleIndex;
      return direction;
    },
    reset() {
      lastMinIndex = null;
      direction = initial;
    },
  };
}

/**
 * Inclusive index bounds of the warm window around the visible range.
 */
export function getWarmWindowBounds(
  minVisibleIndex: number,
  maxVisibleIndex: number,
  direction: FeedScrollDirection,
  dataLength: number,
): { lo: number; hi: number } {
  const behindOffset = direction === "forward" ? VIDEO_WARM_BEHIND : VIDEO_WARM_AHEAD;
  const aheadOffset = direction === "forward" ? VIDEO_WARM_AHEAD : VIDEO_WARM_BEHIND;
  return {
    lo: Math.max(0, minVisibleIndex - behindOffset),
    hi: Math.min(dataLength - 1, maxVisibleIndex + aheadOffset),
  };
}
