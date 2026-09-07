import { api } from "../../client";
import type { PostsResponse, CommentsResponse, PostFilters } from "../../types";
import type { LensMode } from "@/src/domain/communities";
import { fetchCompleteCommentTree } from "../deep-comment-expansion";
import {
  applyLensHttpParams,
  normalizeUserPostsQueryParams,
} from "../request-params";
import {
  withSignedContentReadParams,
} from "../signed-content-read";

export {
  normalizeUserPostsQueryParams,
  type UserPostsQueryParams,
} from "../request-params";

// ============================================
// Posts & Feed
// ============================================

export type GetPostsParams = PostFilters;

/**
 * Get main feed posts
 * Without address: public feed, no user_vote data
 * With address: includes user_vote, blocked content filtering, and a complete signed proof
 */
export async function getPosts(
  params?: GetPostsParams,
  options?: { signal?: AbortSignal },
): Promise<PostsResponse> {
  const paramsFactory = () => withSignedContentReadParams(
    applyLensHttpParams(
      params as Record<string, unknown> | undefined,
      { community: params?.community },
    ),
    "get_posts",
  );
  return api.get<PostsResponse>(
    "/get_posts",
    undefined,
    { ...options, paramsFactory },
  );
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
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
}

/**
 * Get user's submissions or comments
 */
export async function getUserPosts(
  params: GetUserPostsParams,
  options?: { signal?: AbortSignal },
): Promise<PostsResponse> {
  const paramsFactory = () => withSignedContentReadParams(
    applyLensHttpParams({
      ...params,
      ...normalizeUserPostsQueryParams(params),
    } as Record<string, unknown>),
    "get_posts",
  );
  return api.get<PostsResponse>("/get_user_posts", undefined, { ...options, paramsFactory });
}

// ============================================
// Comments
// ============================================

export interface GetCommentsParams {
  post_id: string; // Required post OR comment txhash
  address?: string; // Viewer address
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
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
    async (requestParams, signal) => {
      const paramsFactory = () => withSignedContentReadParams(
        applyLensHttpParams(
          requestParams as Record<string, unknown>,
          { allowTeamWithoutCommunity: true },
        ),
        "get_comments",
      );
      return api.get<CommentsResponse>("/get_comments", undefined, { signal, paramsFactory });
    },
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
