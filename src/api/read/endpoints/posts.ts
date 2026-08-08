import { api } from "../../client";
import type { PostsResponse, CommentsResponse } from "../../types";
import { fetchCompleteCommentTree } from "../deep-comment-expansion";
import { normalizeUserPostsQueryParams } from "../request-params";

export {
  normalizeUserPostsQueryParams,
  type UserPostsQueryParams,
} from "../request-params";

// ============================================
// Posts & Feed
// ============================================

export interface GetPostsParams {
  limit?: number; // max 100
  page?: number;
  topic?: string; // topic name or 'all'
  address?: string; // viewer address for filtering/votes
  allowed_tags?: string; // comma-separated, default 'sensitive'
  feed?: "home" | "following";
  by?: "magic" | "newest" | "top"; // sort mode
}

/**
 * Get main feed posts
 * Without address: public feed, no user_vote data
 * With address: includes user_vote, blocked content filtering
 */
export async function getPosts(
  params?: GetPostsParams
): Promise<PostsResponse> {
  return api.get<PostsResponse>("/get_posts", params);
}

// ============================================
// User Posts
// ============================================

export interface GetUserPostsParams {
  owner: string; // Required
  address?: string; // Viewer address
  type?: "" | "submissions" | "comments";
  page?: number;
  limit?: number; // max 50
  allowed_tags?: string;
}

/**
 * Get user's submissions or comments
 */
export async function getUserPosts(
  params: GetUserPostsParams
): Promise<PostsResponse> {
  return api.get<PostsResponse>("/get_user_posts", {
    ...params,
    ...normalizeUserPostsQueryParams(params),
  });
}

// ============================================
// Comments
// ============================================

export interface GetCommentsParams {
  post_id: string; // Required post OR comment txhash
  address?: string; // Viewer address
}

/**
 * Get the complete thread for a post or comment.
 *
 * One request returns everything the thread UI needs: `ancestors` (the chain
 * from the root post down to the immediate parent), `root` (the focused post
 * or comment), and `children` (its nested reply subtree). Deeply nested
 * replies that the API truncates are resolved transparently.
 */
export async function getComments(
  params: GetCommentsParams,
  options?: { signal?: AbortSignal },
): Promise<CommentsResponse> {
  return fetchCompleteCommentTree(
    params,
    (requestParams, signal) =>
      api.get<CommentsResponse>("/get_comments", requestParams, { signal }),
    options?.signal,
  );
}

// ============================================
// Utility
// ============================================

/**
 * Calculate display points for a post
 * Adjusts for viewer's own vote weight
 */
export function calculateDisplayPoints(post: {
  points?: number;
  user_weight?: number;
  user_vote?: number;
}): number {
  const points = Number.isFinite(post.points) ? (post.points as number) : 0;
  const userWeight = Number.isFinite(post.user_weight)
    ? (post.user_weight as number)
    : 0;
  const userVote = Number.isFinite(post.user_vote)
    ? (post.user_vote as number)
    : 0;
  return Math.round(points - userWeight + userVote);
}
