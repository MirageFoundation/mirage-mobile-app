import { api } from "../../client";
import type {
  PostsResponse,
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
  by?: "magic" | "new" | "top"; // sort mode
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

/**
 * Get comment tree for a post
 */
export async function getComments(
  params: GetCommentsParams
): Promise<CommentsResponse> {
  return api.get<CommentsResponse>("/get_comments", params);
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
