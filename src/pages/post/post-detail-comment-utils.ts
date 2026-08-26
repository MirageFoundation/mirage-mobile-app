import {
  transformApiComment,
  transformApiComments,
} from "@/src/api/read";
import type { CommentsResponse, Post as ApiPost, PostWithChildren } from "@/src/api/types";
import type { Comment } from "@/src/components/molecules";

export type CommentVoteOverrides = Record<
  string,
  { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
>;

export type CommentEditOverrides = Record<string, string>;

export function findCommentById(
  items: Comment[],
  targetId?: string | null,
): Comment | null {
  if (!targetId) return null;
  for (const item of items) {
    if (item.id === targetId) return item;
    const nested = findCommentById(item.replies ?? [], targetId);
    if (nested) return nested;
  }
  return null;
}

export function findTopLevelBranchForComment(
  items: Comment[],
  targetId?: string | null,
): Comment | null {
  if (!targetId) return null;
  return items.find((item) => findCommentById([item], targetId)) ?? null;
}

export function hasMoreRepliesInBranch(
  displayedComments: Comment[],
  fullComments: Comment[],
  focusedCommentId?: string | null,
): boolean {
  const displayedBranch = findTopLevelBranchForComment(
    displayedComments,
    focusedCommentId,
  );
  if (!displayedBranch) return false;

  const fullBranch = findCommentById(fullComments, displayedBranch.id) ??
    findCommentById(fullComments, focusedCommentId);
  if (!fullBranch) return false;

  return countCommentsInTree([fullBranch]) > countCommentsInTree([displayedBranch]);
}

type BuildPostDetailCommentsInput = {
  actualRootPostId?: string | null;
  commentsData?: CommentsResponse;
  contextComments: ApiPost[];
  focusedCommentData?: CommentsResponse;
  focusedCommentId?: string | null;
  fullThreadCommentsData?: CommentsResponse;
  isViewingComment: boolean;
  showFocusedThread: boolean;
};

export function buildPostDetailComments({
  actualRootPostId,
  commentsData,
  contextComments,
  focusedCommentData,
  focusedCommentId,
  fullThreadCommentsData,
  isViewingComment,
  showFocusedThread,
}: BuildPostDetailCommentsInput): Comment[] {
  if (!showFocusedThread && isViewingComment) {
    if (!fullThreadCommentsData?.children) return [];
    return transformApiComments(fullThreadCommentsData.children);
  }

  const focusedApiRoot = isViewingComment ? commentsData?.root : focusedCommentData?.root;
  const focusedApiChildren = isViewingComment
    ? commentsData?.children ?? []
    : focusedCommentData?.children ?? [];

  if (focusedCommentId && !focusedApiRoot) return [];

  if (focusedCommentId && focusedApiRoot) {
    // Render the focused comment immediately, even while ancestor context is
    // still loading. Loaded ancestors wrap around it once they arrive instead
    // of blanking the whole list (previously caused a seconds-long empty gap
    // between the post/banner and the comments).
    const contextRootId = actualRootPostId?.toLowerCase();
    const focusedPostId = focusedApiRoot.post_id.toLowerCase();
    const context = contextComments
      .filter((comment) => {
        const contextPostId = comment.post_id.toLowerCase();
        return contextPostId !== contextRootId && contextPostId !== focusedPostId;
      })
      .map((comment) =>
        transformApiComment(
          { ...comment, children: [] } as PostWithChildren,
          null,
          0,
        ),
      );
    const supplementalSource = isViewingComment
      ? fullThreadCommentsData?.children ?? []
      : commentsData?.children ?? [];
    const supplementalComments = transformApiComments(supplementalSource);
    const expandedFocusedBranch = findTopLevelBranchForComment(
      supplementalComments,
      focusedCommentId,
    );
    if (expandedFocusedBranch) {
      // Show only the focused branch; unrelated comments are reachable via
      // the "Full thread" affordance rather than silently padded in (which
      // made users think they were looking at the wrong comment).
      return [expandedFocusedBranch];
    }
    const focusedFromFullBranch = context.length > 5
      ? findCommentById(supplementalComments, focusedCommentId)
      : null;
    const focused = {
      ...transformApiComment(focusedApiRoot, actualRootPostId ?? undefined, 0),
      isFocusedComment: true,
      replies: focusedFromFullBranch?.replies ?? transformApiComments(focusedApiChildren),
      replyCount: Math.max(
        focusedApiRoot.comments ?? 0,
        focusedFromFullBranch?.replyCount ?? 0,
        focusedApiChildren.length,
      ),
    };

    let thread: Comment = focused;
    for (let index = context.length - 1; index >= 0; index -= 1) {
      thread = {
        ...context[index],
        isFocusedContext: true,
        replies: [thread],
        replyCount: Math.max(context[index].replyCount ?? 0, 1),
      };
    }
    return [{ ...thread, isFocusedContext: true }];
  }

  if (!commentsData?.children) return [];
  return transformApiComments(commentsData.children);
}

function applyVoteOverridesToComment(
  comment: Comment,
  commentVoteOverrides: CommentVoteOverrides,
): Comment {
  const override = commentVoteOverrides[comment.id];
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
        applyVoteOverridesToComment(reply, commentVoteOverrides),
      ),
    };
  }

  return updatedComment;
}

export function applyEditOverridesToComment(
  comment: Comment,
  commentEditOverrides: CommentEditOverrides,
): Comment {
  const editedContent = commentEditOverrides[comment.id];
  const updatedComment: Comment =
    editedContent !== undefined
      ? { ...comment, content: editedContent }
      : comment;

  if (updatedComment.replies && updatedComment.replies.length > 0) {
    return {
      ...updatedComment,
      replies: updatedComment.replies.map((reply) =>
        applyEditOverridesToComment(reply, commentEditOverrides),
      ),
    };
  }

  return updatedComment;
}

function applyOptimisticReplies(
  comment: Comment,
  optimisticReplyComments: Record<string, Comment[]>,
): Comment {
  const pendingReplies = optimisticReplyComments[comment.id] ?? [];
  const existingReplies = comment.replies ?? [];

  const processedReplies = existingReplies.map((reply) =>
    applyOptimisticReplies(reply, optimisticReplyComments),
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

function filterComments(
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

type MergePostDetailCommentsInput = {
  blockedUserIds: Set<string>;
  commentEditOverrides: CommentEditOverrides;
  commentVoteOverrides: CommentVoteOverrides;
  comments: Comment[];
  globalHiddenCommentIds: Set<string>;
  hiddenCommentIds: Set<string>;
  optimisticReplyComments: Record<string, Comment[]>;
  optimisticTopLevelComments: Comment[];
};

export function mergePostDetailComments({
  blockedUserIds,
  commentEditOverrides,
  commentVoteOverrides,
  comments,
  globalHiddenCommentIds,
  hiddenCommentIds,
  optimisticReplyComments,
  optimisticTopLevelComments,
}: MergePostDetailCommentsInput): Comment[] {
  const localIds = new Set(optimisticTopLevelComments.map((comment) => comment.id));
  const serverCommentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const dedupedComments = comments.filter((comment) => !localIds.has(comment.id));
  // Once the server knows a confirmed optimistic comment, adopt its server
  // timestamp so the sort below is stable across the optimistic -> server
  // handoff (prevents a post-hoc reorder jump when the optimistic copy is
  // pruned and the client clock disagreed with the chain timestamp).
  const stabilizedOptimistic = optimisticTopLevelComments.map((comment) => {
    const serverCopy = serverCommentsById.get(comment.id);
    return serverCopy ? { ...comment, createdAt: serverCopy.createdAt } : comment;
  });
  const merged = [...stabilizedOptimistic, ...dedupedComments];
  return filterComments(
    merged
      .map((comment) => applyOptimisticReplies(comment, optimisticReplyComments))
      .map((comment) => applyVoteOverridesToComment(comment, commentVoteOverrides))
      .map((comment) => applyEditOverridesToComment(comment, commentEditOverrides)),
    hiddenCommentIds,
    globalHiddenCommentIds,
    blockedUserIds,
  ).sort((a, b) => {
    const timeA =
      a.createdAt instanceof Date
        ? a.createdAt.getTime()
        : Number(a.createdAt);
    const timeB =
      b.createdAt instanceof Date
        ? b.createdAt.getTime()
        : Number(b.createdAt);
    return timeA - timeB;
  });
}

export function findCommentInTree(comment: Comment, targetId: string): boolean {
  if (comment.id === targetId) return true;
  if (comment.replies) {
    return comment.replies.some((reply) => findCommentInTree(reply, targetId));
  }
  return false;
}

export function countCommentsInTree(items: Comment[]): number {
  return items.reduce(
    (total, item) => total + 1 + countCommentsInTree(item.replies ?? []),
    0,
  );
}
