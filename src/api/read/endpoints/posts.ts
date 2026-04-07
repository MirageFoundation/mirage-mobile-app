import { api } from "../../client";
import type {
  PostsResponse,
  PostWithChildren,
  CommentsResponse,
  RootPostIdResponse,
  CommentContextResponse,
} from "../../types";

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
  type?: "submissions" | "comments";
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
  return api.get<PostsResponse>("/get_user_posts", params);
}

// ============================================
// Comments
// ============================================

export interface GetCommentsParams {
  post_id: string; // Required root txhash
  address?: string; // Viewer address
}

const MAX_DEEP_RESOLVE_DEPTH = 3;

function collectTruncated(nodes: PostWithChildren[]): PostWithChildren[] {
  const result: PostWithChildren[] = [];
  for (const node of nodes) {
    if (node.comments > 0 && (!node.children || node.children.length === 0)) {
      result.push(node);
    }
    if (node.children && node.children.length > 0) {
      result.push(...collectTruncated(node.children));
    }
  }
  return result;
}

async function resolveDeepComments(
  nodes: PostWithChildren[],
  address: string | undefined,
  depth: number = 0,
): Promise<void> {
  if (depth >= MAX_DEEP_RESOLVE_DEPTH) return;

  const truncated = collectTruncated(nodes);
  if (truncated.length === 0) return;

  await Promise.all(
    truncated.map(async (node) => {
      try {
        const subTree = await api.get<CommentsResponse>("/get_comments", {
          post_id: node.post_id,
          address,
        });
        node.children = subTree.children;
      } catch {}
    }),
  );

  await resolveDeepComments(nodes, address, depth + 1);
}

/**
 * Get comment tree for a post
 * Automatically resolves deeply nested replies that the API truncates
 */
export async function getComments(
  params: GetCommentsParams
): Promise<CommentsResponse> {
  const data = await api.get<CommentsResponse>("/get_comments", params);
  await resolveDeepComments(data.children, params.address);
  return data;
}

export interface GetRootPostIdParams {
  comment_id: string;
}

/**
 * Get the root post ID for a comment
 */
export async function getRootPostId(
  params: GetRootPostIdParams
): Promise<RootPostIdResponse> {
  return api.get<RootPostIdResponse>("/get_root_post_id", params);
}

export interface GetCommentContextParams {
  comment_id: string;
  address?: string;
  max_depth?: number; // 1-10
}

/**
 * Get parent context for a comment
 */
export async function getCommentContext(
  params: GetCommentContextParams
): Promise<CommentContextResponse> {
  return api.get<CommentContextResponse>("/get_comment_context", params);
}

// ============================================
// Utility
// ============================================

/**
 * Calculate display points for a post
 * Adjusts for viewer's own vote weight
 */
export function calculateDisplayPoints(post: {
  points: number;
  user_weight: number;
  user_vote: number;
}): number {
  return Math.round(post.points - post.user_weight + post.user_vote);
}
