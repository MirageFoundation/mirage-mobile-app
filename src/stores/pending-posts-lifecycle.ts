import type { Post as ApiPost } from "@/src/api/types";
import {
  isValidCommunitySlug,
  UNSPECIFIED_SERVED_LENS,
  type ServedLens,
} from "@/src/domain/communities";
import { isPostVideoProcessing } from "@/src/domain/posts/video-processing";
import { migrateDraftStateV0 } from "./draft-migration";

export function shouldPersistPendingPost(post: ApiPost, now = Date.now()): boolean {
  if (post.optimistic_status === "pending" || post.optimistic_status === "error") {
    return true;
  }
  return isPostVideoProcessing(post, now);
}

function isSafePendingPost(value: unknown): value is ApiPost {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const post = value as Record<string, unknown>;
  if (
    typeof post.post_id !== "string" ||
    post.post_id.length === 0 ||
    typeof post.user_id !== "string" ||
    post.user_id.length === 0 ||
    typeof post.username !== "string" ||
    typeof post.timestamp !== "number"
  ) {
    return false;
  }
  if (post.media !== undefined && (
    !Array.isArray(post.media) ||
    !post.media.every((item) => typeof item === "string")
  )) {
    return false;
  }
  for (const key of ["title", "content", "community", "root_community", "tag", "thumbnail"] as const) {
    const field = post[key];
    if (field !== undefined && field !== null && typeof field !== "string") {
      return false;
    }
  }
  return true;
}

export function normalizePendingPost(post: unknown, now = Date.now()): ApiPost | null {
  if (!isSafePendingPost(post)) return null;
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

function safeCommunitySlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return isValidCommunitySlug(slug) ? slug : null;
}

function isServedLens(value: unknown): value is ServedLens {
  if (!value || typeof value !== "object") return false;
  const lens = value as Partial<ServedLens>;
  return (
    (lens.requested === "effective"
      || lens.requested === "default"
      || lens.requested === "team"
      || lens.requested === "raw")
    && (lens.effective_mode === 0
      || lens.effective_mode === 1
      || lens.effective_mode === 2)
    && (lens.effective_team_id === null
      || typeof lens.effective_team_id === "number")
  );
}

export function migratePendingPostV3(value: unknown, now = Date.now()): ApiPost | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const post = { ...(value as Record<string, unknown>) };
  const community = safeCommunitySlug(post.community) ?? safeCommunitySlug(post.topic);
  if (!community) return null;
  const rootCommunity = safeCommunitySlug(post.root_community)
    ?? safeCommunitySlug(post.root_topic)
    ?? community;
  delete post.topic;
  delete post.root_topic;
  delete post.agent_edited;
  delete post.agent_edits_meta;
  delete post.appendices;
  post.community = community;
  post.root_community = rootCommunity;
  if (!isServedLens(post.lens)) {
    post.lens = UNSPECIFIED_SERVED_LENS;
  }
  if (typeof post.thread_locked !== "boolean") {
    post.thread_locked = false;
  }
  if (typeof post.protocol_version !== "number") {
    post.protocol_version = 1;
  }
  if (post.optimistic_draft && typeof post.optimistic_draft === "object") {
    post.optimistic_draft = migrateDraftStateV0({
      draft: post.optimistic_draft,
    }).draft;
  }
  return normalizePendingPost(post, now);
}

export function migratePendingPostsState(
  persistedState: unknown,
  now = Date.now(),
): { posts: ApiPost[] } {
  const state = persistedState as { posts?: unknown } | undefined;
  const previousPosts = Array.isArray(state?.posts) ? state.posts : [];
  const posts = previousPosts
    .map((post) => migratePendingPostV3(post, now))
    .filter((post): post is ApiPost => post !== null)
    .slice(0, 10);
  return {
    ...(typeof state === "object" && state ? state : {}),
    posts,
  };
}

export function prunePendingPosts(posts: unknown, now = Date.now()): ApiPost[] {
  if (!Array.isArray(posts)) return [];
  return posts
    .map((post) => migratePendingPostV3(post, now) ?? normalizePendingPost(post, now))
    .filter((post): post is ApiPost => post !== null)
    .slice(0, 10);
}
