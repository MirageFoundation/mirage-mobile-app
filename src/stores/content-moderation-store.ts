/**
 * Content Moderation Store
 *
 * Global state for tracking hidden posts, blocked users, and hidden comments.
 * This allows content to disappear across all screens when blocked/reported.
 */

import { create } from "zustand";

interface ContentModerationState {
  /** Set of hidden post IDs */
  hiddenPostIds: Set<string>;
  /** Set of blocked user IDs */
  blockedUserIds: Set<string>;
  /** Set of hidden comment IDs */
  hiddenCommentIds: Set<string>;

  /** Hide a post */
  hidePost: (postId: string) => void;
  /** Unhide a post (for rollback on delete failure) */
  unhidePost: (postId: string) => void;
  /** Block a user */
  blockUser: (userId: string) => void;
  /** Hide a comment */
  hideComment: (commentId: string) => void;
  /** Unhide a comment (for rollback on delete failure) */
  unhideComment: (commentId: string) => void;
  /** Check if a post is hidden */
  isPostHidden: (postId: string) => boolean;
  /** Check if a user is blocked */
  isUserBlocked: (userId: string) => boolean;
  /** Check if a comment is hidden */
  isCommentHidden: (commentId: string) => boolean;
  /** Clear all moderation state (e.g., on logout) */
  clearAll: () => void;
}

export const useContentModerationStore = create<ContentModerationState>(
  (set, get) => ({
    hiddenPostIds: new Set(),
    blockedUserIds: new Set(),
    hiddenCommentIds: new Set(),

    hidePost: (postId: string) => {
      set((state) => ({
        hiddenPostIds: new Set(state.hiddenPostIds).add(postId),
      }));
    },

    unhidePost: (postId: string) => {
      set((state) => {
        const newSet = new Set(state.hiddenPostIds);
        newSet.delete(postId);
        return { hiddenPostIds: newSet };
      });
    },

    blockUser: (userId: string) => {
      set((state) => ({
        blockedUserIds: new Set(state.blockedUserIds).add(userId),
      }));
    },

    hideComment: (commentId: string) => {
      set((state) => ({
        hiddenCommentIds: new Set(state.hiddenCommentIds).add(commentId),
      }));
    },

    unhideComment: (commentId: string) => {
      set((state) => {
        const newSet = new Set(state.hiddenCommentIds);
        newSet.delete(commentId);
        return { hiddenCommentIds: newSet };
      });
    },

    isPostHidden: (postId: string) => {
      return get().hiddenPostIds.has(postId);
    },

    isUserBlocked: (userId: string) => {
      return get().blockedUserIds.has(userId);
    },

    isCommentHidden: (commentId: string) => {
      return get().hiddenCommentIds.has(commentId);
    },

    clearAll: () => {
      set({
        hiddenPostIds: new Set(),
        blockedUserIds: new Set(),
        hiddenCommentIds: new Set(),
      });
    },
  })
);
