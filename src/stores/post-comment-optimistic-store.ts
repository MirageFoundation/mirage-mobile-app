import { create } from "zustand";
import type { Comment } from "@/src/domain/content";

type ReplyMap = Record<string, Comment[]>;

const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_REPLY_MAP: ReplyMap = {};

type OptimisticPostCommentState = {
  topLevelCommentsByPost: Record<string, Comment[]>;
  replyCommentsByPost: Record<string, ReplyMap>;
  addTopLevelComment: (postId: string, comment: Comment) => void;
  addReplyComment: (postId: string, parentId: string, comment: Comment) => void;
  replaceCommentId: (postId: string, optimisticId: string, confirmedId: string) => void;
  removeComment: (postId: string, commentId: string) => void;
  pruneCommentsPresentOnServer: (postId: string, serverComments: Comment[]) => void;
};

export function shouldPruneOptimisticComment(
  optimisticComment: Comment,
  serverComments: Comment[],
): boolean {
  for (const serverComment of serverComments) {
    // A confirmed stand-in already uses the server id. Keep it so the
    // delayed refetch does not remount/reorder the row the user just posted.
    if (serverComment.id === optimisticComment.id) return false;

    if (
      serverComment.content === optimisticComment.content &&
      serverComment.author.id === optimisticComment.author.id
    ) {
      return true;
    }

    if (
      serverComment.replies &&
      serverComment.replies.length > 0 &&
      shouldPruneOptimisticComment(optimisticComment, serverComment.replies)
    ) {
      return true;
    }
  }

  return false;
}

export const usePostCommentOptimisticStore = create<OptimisticPostCommentState>(
  (set) => ({
    topLevelCommentsByPost: {},
    replyCommentsByPost: {},
    addTopLevelComment: (postId, comment) =>
      set((state) => ({
        topLevelCommentsByPost: {
          ...state.topLevelCommentsByPost,
          [postId]: [
            comment,
            ...(state.topLevelCommentsByPost[postId] ?? []).filter(
              (existing) => existing.id !== comment.id,
            ),
          ],
        },
      })),
    addReplyComment: (postId, parentId, comment) =>
      set((state) => {
        const currentReplies = state.replyCommentsByPost[postId]?.[parentId] ?? [];
        return {
          replyCommentsByPost: {
            ...state.replyCommentsByPost,
            [postId]: {
              ...(state.replyCommentsByPost[postId] ?? {}),
              [parentId]: [
                ...currentReplies.filter((existing) => existing.id !== comment.id),
                comment,
              ],
            },
          },
        };
      }),
    replaceCommentId: (postId, optimisticId, confirmedId) =>
      set((state) => {
        const topLevelComments = state.topLevelCommentsByPost[postId] ?? [];
        const replyComments = state.replyCommentsByPost[postId] ?? {};

        const nextTopLevelComments = topLevelComments.map((comment) =>
          comment.id === optimisticId ? { ...comment, id: confirmedId } : comment,
        );

        const nextReplyComments = Object.fromEntries(
          Object.entries(replyComments).map(([parentId, comments]) => [
            parentId,
            comments.map((comment) =>
              comment.id === optimisticId
                ? { ...comment, id: confirmedId }
                : comment,
            ),
          ]),
        );

        return {
          topLevelCommentsByPost: {
            ...state.topLevelCommentsByPost,
            [postId]: nextTopLevelComments,
          },
          replyCommentsByPost: {
            ...state.replyCommentsByPost,
            [postId]: nextReplyComments,
          },
        };
      }),
    removeComment: (postId, commentId) =>
      set((state) => {
        const nextTopLevelComments = (state.topLevelCommentsByPost[postId] ?? []).filter(
          (comment) => comment.id !== commentId,
        );

        const currentReplyComments = state.replyCommentsByPost[postId] ?? {};
        const nextReplyComments = Object.fromEntries(
          Object.entries(currentReplyComments)
            .map(([parentId, comments]) => [
              parentId,
              comments.filter((comment) => comment.id !== commentId),
            ])
            .filter(([, comments]) => comments.length > 0),
        );

        return {
          topLevelCommentsByPost: {
            ...state.topLevelCommentsByPost,
            [postId]: nextTopLevelComments,
          },
          replyCommentsByPost: {
            ...state.replyCommentsByPost,
            [postId]: nextReplyComments,
          },
        };
      }),
    pruneCommentsPresentOnServer: (postId, serverComments) =>
      set((state) => {
        const nextTopLevelComments = (state.topLevelCommentsByPost[postId] ?? []).filter(
          (comment) => !shouldPruneOptimisticComment(comment, serverComments),
        );

        const currentReplyComments = state.replyCommentsByPost[postId] ?? {};
        const nextReplyComments = Object.fromEntries(
          Object.entries(currentReplyComments)
            .map(([parentId, comments]) => [
              parentId,
              comments.filter(
                (comment) => !shouldPruneOptimisticComment(comment, serverComments),
              ),
            ])
            .filter(([, comments]) => comments.length > 0),
        );

        return {
          topLevelCommentsByPost: {
            ...state.topLevelCommentsByPost,
            [postId]: nextTopLevelComments,
          },
          replyCommentsByPost: {
            ...state.replyCommentsByPost,
            [postId]: nextReplyComments,
          },
        };
      }),
  }),
);

export const useOptimisticTopLevelComments = (postId?: string) =>
  usePostCommentOptimisticStore(
    (state) =>
      postId
        ? (state.topLevelCommentsByPost[postId] ?? EMPTY_COMMENTS)
        : EMPTY_COMMENTS,
  );

export const useOptimisticReplyComments = (postId?: string) =>
  usePostCommentOptimisticStore(
    (state) =>
      postId
        ? (state.replyCommentsByPost[postId] ?? EMPTY_REPLY_MAP)
        : EMPTY_REPLY_MAP,
  );
