import type { Post as ApiPost, PostsResponse } from "@/src/api/types";

export function hasTransientPostSuccess(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(hasTransientPostSuccess);
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  if (record.optimistic_status === "success") return true;
  return ["pages", "posts", "root", "children", "data"].some((key) =>
    hasTransientPostSuccess(record[key]),
  );
}

export function hasOptimisticPostState(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(hasOptimisticPostState);
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  if (
    record.optimistic_status !== undefined ||
    record.optimistic_action_id !== undefined ||
    record.optimistic_draft !== undefined ||
    record.optimistic_video_preview_until !== undefined
  ) {
    return true;
  }
  return ["pages", "posts", "root", "children", "data"].some((key) =>
    hasOptimisticPostState(record[key]),
  );
}

export function setTransientPostSuccessInResponse(
  response: PostsResponse,
  postId: string,
  active: boolean,
): PostsResponse {
  let changed = false;
  const posts = response.posts.map((post) => {
    if (post.post_id !== postId) return post;
    const nextStatus = active ? "success" as const : undefined;
    if (post.optimistic_status === nextStatus && post.optimistic_error === undefined) {
      return post;
    }
    changed = true;
    return {
      ...post,
      optimistic_status: nextStatus,
      optimistic_error: undefined,
    };
  });
  return changed ? { ...response, posts } : response;
}

export function setTransientPostSuccessInData(
  data: unknown,
  postId: string,
  active: boolean,
): unknown {
  if (!data || typeof data !== "object") return data;
  if ("pages" in data && Array.isArray((data as { pages?: unknown }).pages)) {
    const infiniteData = data as { pages: PostsResponse[]; pageParams: unknown[] };
    let changed = false;
    const pages = infiniteData.pages.map((page) => {
      const next = setTransientPostSuccessInResponse(page, postId, active);
      if (next !== page) changed = true;
      return next;
    });
    return changed ? { ...infiniteData, pages } : data;
  }
  return setTransientPostSuccessInResponse(data as PostsResponse, postId, active);
}

export function mergePendingPostWithCachedPost(
  pendingPost: ApiPost,
  cachedPost: ApiPost | undefined,
): ApiPost {
  if (cachedPost?.optimistic_status !== "success") return pendingPost;
  return {
    ...pendingPost,
    optimistic_status: "success",
    optimistic_error: undefined,
  };
}

export function mergeRefreshedPostPreservingOrder(
  response: PostsResponse,
  fallbackPost: ApiPost,
  transientSuccessActive: boolean,
  preserveFallbackPost: boolean,
): PostsResponse {
  const matchIndex = response.posts.findIndex((post) =>
    post.post_id === fallbackPost.post_id ||
    (!!fallbackPost.optimistic_action_id &&
      post.optimistic_action_id === fallbackPost.optimistic_action_id),
  );
  if (matchIndex < 0) {
    if (!transientSuccessActive && !preserveFallbackPost) return response;
    const postToInsert = transientSuccessActive
      ? { ...fallbackPost, optimistic_status: "success" as const, optimistic_error: undefined }
      : fallbackPost;
    return { ...response, posts: [postToInsert, ...response.posts], total: response.total + 1 };
  }
  if (!transientSuccessActive && !preserveFallbackPost) return response;
  const posts = [...response.posts];
  posts[matchIndex] = {
    ...posts[matchIndex],
    ...(preserveFallbackPost ? fallbackPost : undefined),
    optimistic_status: transientSuccessActive ? "success" : fallbackPost.optimistic_status,
    optimistic_error: undefined,
  };
  return { ...response, posts };
}
