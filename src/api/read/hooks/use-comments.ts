import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getComments } from "../endpoints/posts";
import { useAuthStore } from "@/src/stores";
import type { LensRequest } from "@/src/domain/communities";
import { POST_DETAIL_QUERY_GC_TIME } from "../infinite-query-policy";
import { shouldRetrySignedContentRead } from "../signed-content-read";

/**
 * Get the complete thread for a post or comment.
 *
 * One request returns the ancestor chain, the focused node, and its reply
 * subtree — see `readThreadAncestors` for reading the shape. Automatically
 * includes the viewer's address for personalized data.
 *
 * staleTime: 30 seconds
 */
export function useComments(
  postId: string | undefined | null,
  options?: { enabled?: boolean } & LensRequest,
) {
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const lensRequest = {
    lens: options?.lens,
    team_id: options?.team_id,
    scope: options?.scope,
    lens_picks: options?.lens_picks,
  };

  return useQuery({
    queryKey: queryKeys.comments(postId!, walletAddress ?? undefined, lensRequest),
    queryFn: ({ signal }) =>
      getComments({
        post_id: postId!,
        address: walletAddress ?? undefined,
        ...lensRequest,
      }, { signal }),
    enabled: !!postId && (options?.enabled ?? true),
    staleTime: 1000 * 30, // 30 seconds
    gcTime: POST_DETAIL_QUERY_GC_TIME,
    retry: (failureCount, error) =>
      shouldRetrySignedContentRead(failureCount, error),
  });
}
