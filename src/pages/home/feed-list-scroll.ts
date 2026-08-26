import type { LegendListRef } from "@legendapp/list/react-native";

export type FeedListRef = LegendListRef;

export function scrollFeedListToTop(
  list: FeedListRef | null | undefined,
  options?: { animated?: boolean },
): Promise<void> {
  if (!list) return Promise.resolve();
  return list
    .scrollToOffset({
      offset: 0,
      animated: options?.animated ?? false,
    })
    .then(() => undefined)
    .catch(() => undefined);
}
