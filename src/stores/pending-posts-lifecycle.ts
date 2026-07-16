import type { Post as ApiPost } from "@/src/api/types";
import { isPostVideoProcessing } from "@/src/domain/posts/video-processing";

export function shouldPersistPendingPost(post: ApiPost, now = Date.now()): boolean {
  if (post.optimistic_status === "pending" || post.optimistic_status === "error") {
    return true;
  }
  return isPostVideoProcessing(post, now);
}

export function normalizePendingPost(post: ApiPost, now = Date.now()): ApiPost | null {
  if (!shouldPersistPendingPost(post, now)) return null;
  if (post.optimistic_status !== "success") return post;
  return {
    ...post,
    optimistic_status: undefined,
    optimistic_error: undefined,
    optimistic_cached_until: undefined,
  };
}

export function matchesPendingPostAlias(
  post: ApiPost,
  postId: string,
  optimisticActionId?: string,
): boolean {
  const normalizedId = postId.toLowerCase();
  return (
    post.post_id.toLowerCase() === normalizedId ||
    (!!optimisticActionId && post.optimistic_action_id === optimisticActionId)
  );
}

export function prunePendingPosts(posts: ApiPost[], now = Date.now()): ApiPost[] {
  return posts
    .map((post) => normalizePendingPost(post, now))
    .filter((post): post is ApiPost => post !== null)
    .slice(0, 10);
}
