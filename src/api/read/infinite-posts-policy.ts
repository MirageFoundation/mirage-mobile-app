export type InfinitePostsQueryPolicyInput = {
  isInitializing: boolean;
  isRestoring: boolean;
  enabled?: boolean;
};

// Feed list membership is owned manually, never by TanStack's refetch triggers.
//
// Refetching an infinite query re-runs *every* retained page and replaces the
// cached pages wholesale, so any automatic refetch splices freshly published
// posts into the top of the list while the user is reading it. It also drags
// the new-posts baseline forward (see use-new-posts-checker, which derives its
// baseline from the newest post on page 1), which means the "New posts" pill
// could never appear: the feed had already swallowed the new posts.
//
// Keeping the query permanently fresh means new content only reaches the list
// through explicit intent:
//   - pull-to-refresh / tab-tap scroll-to-top-and-refresh
//   - the "New posts" pill (fetchAllNew refresh)
//   - fetchNextPage() while paginating
//   - targeted cache writes from mutations
// Background work still happens without touching list order: the new-posts
// checker polls page 1 and surfaces the pill, and usePostDataRefresher merges
// fresh metadata (points, comment counts, votes) onto the posts already on
// screen.
export const INFINITE_POSTS_STALE_TIME = Number.POSITIVE_INFINITY;

export function getInfinitePostsQueryPolicy({
  isInitializing,
  isRestoring,
  enabled = true,
}: InfinitePostsQueryPolicyInput) {
  return {
    enabled: !isInitializing && !isRestoring && enabled,
    // Infinite staleness also keeps the feed out of the centralized
    // foreground/reconnect stale-query recovery pass, which would otherwise
    // reorder the list after the app returns from the background.
    staleTime: INFINITE_POSTS_STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // Reconnect recovery is coordinated centrally in QueryProvider. Enabling
    // TanStack's built-in pass as well refetches every retained infinite page
    // twice and can create a large burst of feed requests.
    refetchOnReconnect: false,
  } as const;
}
