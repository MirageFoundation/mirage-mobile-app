export const POSTED_COMMENT_REVEAL_TIMEOUT_MS = 4000;

export type PostedCommentReveal = {
  id: string;
  createdAt: number;
};

export type PostedCommentRevealNode = {
  id: string;
  replies?: PostedCommentRevealNode[] | null;
};

export type PostedCommentRevealDecision =
  | { type: "idle" }
  | { type: "wait" }
  | { type: "timeout" }
  | { type: "scroll"; index: number; commentId: string };

function containsComment(
  comment: PostedCommentRevealNode,
  commentId: string,
): boolean {
  if (comment.id === commentId) return true;
  return comment.replies?.some((reply) => containsComment(reply, commentId)) ?? false;
}

export function findCommentTopLevelIndex(
  comments: PostedCommentRevealNode[],
  commentId: string,
): number {
  return comments.findIndex((comment) => containsComment(comment, commentId));
}

export function transferCommentRevealId(
  currentId: string | null | undefined,
  fromId: string,
  toId: string,
): string | null {
  if (!currentId) return currentId ?? null;
  return currentId === fromId ? toId : currentId;
}

export function decidePostedCommentReveal({
  pending,
  comments,
  alreadyScrolledId,
  ready = true,
  now = Date.now(),
  timeoutMs = POSTED_COMMENT_REVEAL_TIMEOUT_MS,
}: {
  pending: PostedCommentReveal | null;
  comments: PostedCommentRevealNode[];
  alreadyScrolledId?: string | null;
  ready?: boolean;
  now?: number;
  timeoutMs?: number;
}): PostedCommentRevealDecision {
  if (!pending) return { type: "idle" };
  if (alreadyScrolledId === pending.id) return { type: "idle" };

  const index = findCommentTopLevelIndex(comments, pending.id);
  if (index >= 0 && ready) {
    return { type: "scroll", index, commentId: pending.id };
  }

  if (now - pending.createdAt >= timeoutMs) return { type: "timeout" };
  return { type: "wait" };
}

export function shouldScrollPostedCommentToEnd(
  index: number,
  commentCount: number,
): boolean {
  return commentCount > 0 && index === commentCount - 1;
}
