import type { QueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";

import { clearOptimisticVideoProcessingFromData } from "./optimistic-video-processing";
import { queryKeys } from "../read/query-keys";
import { usePendingPostsStore } from "@/src/stores/pending-posts-store";

export function markOptimisticVideoProcessingComplete(
  queryClient: QueryClient,
  postId: string,
): void {
  Sentry.addBreadcrumb({
    category: "create-post",
    message: "Pending video processing completed",
    level: "info",
    data: { postId },
  });
  const persistedPost = usePendingPostsStore
    .getState()
    .posts.find((post) => post.post_id === postId);
  if (persistedPost) {
    usePendingPostsStore.getState().upsertPost({
      ...persistedPost,
      optimistic_video_preview_until: undefined,
    });
  }

  [
    queryKeys.postsRoot(),
    queryKeys.userPostsRoot(),
    queryKeys.commentsRoot(),
  ].forEach((queryKey) => {
    queryClient.setQueriesData({ queryKey }, (data) =>
      clearOptimisticVideoProcessingFromData(data, postId),
    );
  });
}
