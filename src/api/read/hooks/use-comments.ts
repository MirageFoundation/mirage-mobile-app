import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getComments,
  getRootPostId,
  getCommentContext,
  type GetCommentContextParams,
} from "../endpoints/posts";
import { useAuthStore } from "@/src/stores";

/**
 * Get comment tree for a post
 * Automatically includes viewer's address for personalized data
 *
 * staleTime: 30 seconds
 */
export function useComments(postId: string | undefined | null) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.comments(postId!, walletAddress ?? undefined),
    queryFn: () =>
      getComments({
        post_id: postId!,
        address: walletAddress ?? undefined,
      }),
    enabled: !!postId,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get root post ID for a comment
 * Useful for navigating to the root discussion
 *
 * @param commentId - The comment ID to find root for
 */
export function useRootPostId(commentId: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.rootPostId(commentId!),
    queryFn: () => getRootPostId({ comment_id: commentId! }),
    enabled: !!commentId,
    staleTime: 1000 * 60 * 60, // 1 hour (doesn't change)
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Get parent context for a comment
 * Returns array of parent posts up to specified depth
 *
 * @param commentId - The comment ID
 * @param maxDepth - Maximum depth to traverse (1-10)
 */
export function useCommentContext(
  commentId: string | undefined | null,
  maxDepth?: number
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  const params: GetCommentContextParams = {
    comment_id: commentId!,
    address: walletAddress ?? undefined,
    max_depth: maxDepth,
  };

  return useQuery({
    queryKey: queryKeys.commentContext(commentId!, maxDepth),
    queryFn: () => getCommentContext(params),
    enabled: !!commentId,
    staleTime: 1000 * 60, // 1 minute
  });
}
