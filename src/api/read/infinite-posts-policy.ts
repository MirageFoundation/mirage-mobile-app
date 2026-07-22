export type InfinitePostsQueryPolicyInput = {
  isInitializing: boolean;
  isRestoring: boolean;
  enabled?: boolean;
};

export const INFINITE_POSTS_STALE_TIME = 0;

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
    refetchOnReconnect: true,
  } as const;
}
