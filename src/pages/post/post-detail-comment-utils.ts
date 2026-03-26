import type { Comment } from "@/src/components/molecules";

export type CommentVoteOverride = {
  hasLiked?: boolean;
  hasDisliked?: boolean;
  likeDelta?: number;
};

export function applyVoteOverridesToComment(
  comment: Comment,
  overrides: Record<string, CommentVoteOverride>,
): Comment {
  const override = overrides[comment.id];
  const updatedComment: Comment = override
    ? {
        ...comment,
        likes: comment.likes + (override.likeDelta ?? 0),
        hasLiked: override.hasLiked ?? comment.hasLiked,
        hasDisliked: override.hasDisliked ?? comment.hasDisliked,
      }
    : comment;

  if (updatedComment.replies && updatedComment.replies.length > 0) {
    return {
      ...updatedComment,
      replies: updatedComment.replies.map((reply) =>
        applyVoteOverridesToComment(reply, overrides),
      ),
    };
  }

  return updatedComment;
}

export function applyEditOverridesToComment(
  comment: Comment,
  editOverrides: Record<string, string>,
): Comment {
  const editedContent = editOverrides[comment.id];
  const updatedComment: Comment =
    editedContent !== undefined ? { ...comment, content: editedContent } : comment;

  if (updatedComment.replies && updatedComment.replies.length > 0) {
    return {
      ...updatedComment,
      replies: updatedComment.replies.map((reply) =>
        applyEditOverridesToComment(reply, editOverrides),
      ),
    };
  }

  return updatedComment;
}

export function applyOptimisticReplies(
  comment: Comment,
  optimisticReplies: Record<string, Comment[]>,
): Comment {
  const pendingReplies = optimisticReplies[comment.id] ?? [];
  const existingReplies = comment.replies ?? [];

  const processedReplies = existingReplies.map((reply) =>
    applyOptimisticReplies(reply, optimisticReplies),
  );

  const existingIds = new Set(existingReplies.map((reply) => reply.id));
  const dedupedPending = pendingReplies.filter((reply) => !existingIds.has(reply.id));
  const allReplies = [...processedReplies, ...dedupedPending];

  return {
    ...comment,
    replies: allReplies.length > 0 ? allReplies : comment.replies,
    replyCount: (comment.replyCount ?? 0) + dedupedPending.length,
  };
}

export function filterComments(
  commentList: Comment[],
  hiddenCommentIds: Set<string>,
  globalHiddenCommentIds: Set<string>,
  blockedUserIds: Set<string>,
): Comment[] {
  return commentList
    .filter(
      (comment) =>
        !hiddenCommentIds.has(comment.id) &&
        !globalHiddenCommentIds.has(comment.id) &&
        !blockedUserIds.has(comment.author.id),
    )
    .map((comment) => ({
      ...comment,
      replies: comment.replies
        ? filterComments(
            comment.replies,
            hiddenCommentIds,
            globalHiddenCommentIds,
            blockedUserIds,
          )
        : undefined,
    }));
}

export function findCommentInTree(comment: Comment, targetId: string): boolean {
  if (comment.id === targetId) return true;
  if (comment.replies) {
    return comment.replies.some((reply) => findCommentInTree(reply, targetId));
  }
  return false;
}

export function sortCommentsByCreatedAt(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => {
    const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt);
    const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt);
    return timeB - timeA;
  });
}
