export const INITIAL_PAGE_SIZE = 10;
export const NEXT_PAGE_SIZE = 12;
export const PREFETCH_THRESHOLD = 6;

export type HomeFeedTabSelection = {
  key: "magic" | "latest";
  querySort: "magic" | "newest";
};

export function selectHomeFeedTab(activeTabIndex: number): HomeFeedTabSelection {
  return activeTabIndex === 0
    ? { key: "magic", querySort: "magic" }
    : { key: "latest", querySort: "newest" };
}

export function getHomeFeedContext(
  feed: "home" | "following",
  activeTabIndex: number,
): string {
  return `${feed}:${selectHomeFeedTab(activeTabIndex).key}`;
}

export function getLatestPostTimestamp(
  pages: { posts?: { timestamp: number }[] }[] | undefined,
): number | null {
  const posts = pages?.[0]?.posts;
  if (!posts?.length) return null;

  let latestTimestamp = 0;
  for (const post of posts) {
    if (post.timestamp > latestTimestamp) latestTimestamp = post.timestamp;
  }
  return latestTimestamp > 0 ? latestTimestamp : null;
}

export function shouldPrefetchNextPage(
  visibleIndex: number,
  totalLoaded: number,
  pageSize = NEXT_PAGE_SIZE,
  threshold = PREFETCH_THRESHOLD,
): boolean {
  const currentPageStart = Math.max(0, totalLoaded - pageSize);
  return visibleIndex - currentPageStart >= threshold;
}
