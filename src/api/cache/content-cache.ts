import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { readThreadAncestors } from "@/src/api/read/thread-ancestors";
import type { CommentsResponse, Post as ApiPost, PostWithChildren } from "@/src/api/types";

export function getPostQueries(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() });
}

export function getCommentQueries(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: queryKeys.commentsRoot() });
}

export function findCachedThreadRoot(
  queryClient: QueryClient,
  postId: string,
): PostWithChildren | ApiPost | null {
  const target = postId.toLowerCase();
  for (const [, data] of getCommentQueries(queryClient)) {
    const comments = data as CommentsResponse | undefined;
    const thread = readThreadAncestors(comments);
    const root = thread.rootPost ?? comments?.root;
    if (root?.post_id?.toLowerCase() === target) return root;
    if (thread.rootPostId?.toLowerCase() === target && thread.rootPost) {
      return thread.rootPost;
    }
  }
  return null;
}

export function cancelPostAndCommentQueries(queryClient: QueryClient): Promise<void[]> {
  return Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.postsRoot() }),
    queryClient.cancelQueries({ queryKey: queryKeys.commentsRoot() }),
  ]);
}

export function invalidatePosts(
  queryClient: QueryClient,
  refetchType: "none" | "active" | "inactive" | "all" = "inactive",
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.postsRoot(),
    refetchType,
  });
}

export function invalidateComments(
  queryClient: QueryClient,
  refetchType: "none" | "active" | "inactive" | "all" = "inactive",
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.commentsRoot(),
    refetchType,
  });
}

export function invalidatePostAndCommentQueries(
  queryClient: QueryClient,
  refetchType: "none" | "active" | "inactive" | "all" = "inactive",
): Promise<void[]> {
  return Promise.all([
    invalidatePosts(queryClient, refetchType),
    invalidateComments(queryClient, refetchType),
  ]);
}

export function markPostsStaleWithoutRefetch(queryClient: QueryClient): Promise<void> {
  return invalidatePosts(queryClient, "none");
}

export function markCommentsStaleWithoutRefetch(queryClient: QueryClient): Promise<void> {
  return invalidateComments(queryClient, "none");
}
