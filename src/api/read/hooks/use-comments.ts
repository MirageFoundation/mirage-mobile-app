import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getComments } from "../endpoints/posts";
import { useAuthStore } from "@/src/stores";
import { POST_DETAIL_QUERY_GC_TIME } from "../infinite-query-policy";

/**
 * Get the complete thread for a post or comment.
 *
 * One request returns the ancestor chain, the focused node, and its reply
 * subtree — see `readThreadAncestors` for reading the shape. Automatically
 * includes the viewer's address for personalized data.
 *
 * staleTime: 30 seconds
 */
export function useComments(postId: string | undefined | null, options?: { enabled?: boolean }) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.comments(postId!, walletAddress ?? undefined),
    queryFn: ({ signal }) =>
      getComments({
        post_id: postId!,
        address: walletAddress ?? undefined,
      }, { signal }),
    enabled: !!postId && (options?.enabled ?? true),
    staleTime: 1000 * 30, // 30 seconds
    gcTime: POST_DETAIL_QUERY_GC_TIME,
    retry: (failureCount, error) => {
      const status = (error as any)?.status ?? (error as any)?.response?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });
}
