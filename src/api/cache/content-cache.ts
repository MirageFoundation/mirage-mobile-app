import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";

export function getPostQueries(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() });
}

export function getCommentQueries(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: queryKeys.commentsRoot() });
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
