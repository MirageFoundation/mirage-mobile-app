export type InfinitePostsQueryPolicyInput = {
  isInitializing: boolean;
  isRestoring: boolean;
  enabled?: boolean;
};

export const INFINITE_POSTS_STALE_TIME = 2 * 60 * 1000;

export function getInfinitePostsQueryPolicy({
  isInitializing,
  isRestoring,
  enabled = true,
}: InfinitePostsQueryPolicyInput) {
  return {
    enabled: !isInitializing && !isRestoring && enabled,
    staleTime: INFINITE_POSTS_STALE_TIME,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    // Reconnect recovery is coordinated centrally in QueryProvider. Enabling
    // TanStack's built-in pass as well refetches every retained infinite page
    // twice and can create a large burst of feed requests.
    refetchOnReconnect: false,
  } as const;
}
