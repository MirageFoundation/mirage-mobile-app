import type { PostWithChildren } from "../../types";
import type { Comment } from "@/src/components/molecules";
import { calculateDisplayPoints } from "../endpoints/posts";

/**
 * Transform API PostWithChildren to UI Comment format
 * Recursively transforms the nested comment tree
 */
export function transformApiComment(
  apiComment: PostWithChildren,
  parentId?: string | null,
  depth: number = 0
): Comment {
  // Calculate display points (adjusts for user's own vote)
  const displayPoints = calculateDisplayPoints(apiComment);

  // Determine if user has liked/disliked based on user_vote
  const hasLiked = apiComment.user_vote === 1;
  const hasDisliked = apiComment.user_vote === -1;

  // Transform children recursively
  const replies: Comment[] | undefined =
    apiComment.children && apiComment.children.length > 0
      ? apiComment.children.map((child) =>
          transformApiComment(child, apiComment.post_id, depth + 1)
        )
      : undefined;

  return {
    id: apiComment.post_id,
    author: {
      id: apiComment.user_id,
      username: apiComment.username,
      avatarSeed: apiComment.username, // Use username as seed for DiceBear
    },
    content: apiComment.content || apiComment.title || "",
    likes: Math.max(0, displayPoints),
    dislikes: Math.max(0, -displayPoints),
    hasLiked,
    hasDisliked,
    createdAt: apiComment.timestamp * 1000, // Convert seconds to milliseconds
    replies,
    replyCount: apiComment.children?.length ?? 0,
    parentId: parentId ?? null,
    depth,
  };
}

/**
 * Transform array of API PostWithChildren to UI Comments
 * Used for the top-level children array from CommentsResponse
 */
export function transformApiComments(
  apiComments: PostWithChildren[]
): Comment[] {
  return apiComments.map((comment) => transformApiComment(comment, null, 0));
}

