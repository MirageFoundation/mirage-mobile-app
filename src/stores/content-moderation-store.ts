/**
 * Content Moderation Store
 *
 * Global state for tracking hidden posts, blocked users, blocked topics, and hidden comments.
 * This allows content to disappear across all screens when blocked/reported.
 *
 * `hiddenPostIds` is persisted locally (wallet-scoped) so user-hidden posts
 * stay gone across app restarts. Other sets are session-only optimistic state.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  registerWalletScopedStore,
  walletScopedStorage,
} from "./wallet-scoped-storage";

interface ContentModerationState {
  hiddenPostIds: Set<string>;
  blockedUserIds: Set<string>;
  blockedTopicNames: Set<string>;
  hiddenCommentIds: Set<string>;

  hidePost: (postId: string) => void;
  unhidePost: (postId: string) => void;
  blockUser: (userId: string) => void;
  blockTopic: (topic: string) => void;
  unblockTopic: (topic: string) => void;
  isTopicBlocked: (topic: string) => boolean;
  hideComment: (commentId: string) => void;
  unhideComment: (commentId: string) => void;
  isPostHidden: (postId: string) => boolean;
  isUserBlocked: (userId: string) => boolean;
  isCommentHidden: (commentId: string) => boolean;
  clearAll: () => void;
}

type PersistedContentModerationState = {
  hiddenPostIds: string[];
};

function toHiddenPostIdSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0));
}

export const useContentModerationStore = create<ContentModerationState>()(
  persist(
    (set, get) => ({
      hiddenPostIds: new Set(),
      blockedUserIds: new Set(),
      blockedTopicNames: new Set(),
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

      blockTopic: (topic: string) => {
        set((state) => ({
          blockedTopicNames: new Set(state.blockedTopicNames).add(topic.toLowerCase()),
        }));
      },

      unblockTopic: (topic: string) => {
        set((state) => {
          const newSet = new Set(state.blockedTopicNames);
          newSet.delete(topic.toLowerCase());
          return { blockedTopicNames: newSet };
        });
      },

      isTopicBlocked: (topic: string) => {
        return get().blockedTopicNames.has(topic.toLowerCase());
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
          blockedTopicNames: new Set(),
          hiddenCommentIds: new Set(),
        });
      },
    }),
    {
      name: "content-moderation-storage",
      storage: createJSONStorage(() => walletScopedStorage),
      skipHydration: true,
      partialize: (state) => ({
        hiddenPostIds: Array.from(state.hiddenPostIds),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedContentModerationState> | undefined;
        return {
          ...currentState,
          hiddenPostIds: toHiddenPostIdSet(persisted?.hiddenPostIds),
        };
      },
    },
  ),
);

registerWalletScopedStore({
  storageName: "content-moderation-storage",
  reset: () => useContentModerationStore.getState().clearAll(),
  rehydrate: () => useContentModerationStore.persist.rehydrate(),
});
