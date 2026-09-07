import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as Sentry from "@sentry/react-native";

import type { Post as ApiPost } from "@/src/api/types";
import {
  registerWalletScopedStore,
  walletScopedStorage,
} from "./wallet-scoped-storage";
import {
  matchesPendingPostAlias,
  migratePendingPostsState,
  normalizePendingPost,
  prunePendingPosts,
} from "./pending-posts-lifecycle";
import {
  buildPendingPostIndex,
  selectPendingPost,
  type PendingPostIndex,
} from "./pending-posts-index";

type PendingPostsState = {
  posts: ApiPost[];
  postsById: PendingPostIndex<ApiPost>;
  upsertPost: (post: ApiPost) => void;
  removePost: (postId: string, optimisticActionId?: string) => void;
  removeExpiredPosts: () => void;
  getPost: (postId: string) => ApiPost | undefined;
  markPostError: (postId: string, errorMessage: string) => void;
};

export const usePendingPostsStore = create<PendingPostsState>()(
  persist(
    (set, get) => ({
      posts: [] as ApiPost[],
      postsById: {},
      upsertPost: (post) =>
        set((state) => {
          const pendingPost = normalizePendingPost(post);
          if (!pendingPost) {
            const posts = state.posts.filter((item) => !matchesPendingPostAlias(
              item,
              post.post_id,
              post.optimistic_action_id,
            ));
            return {
              posts,
              postsById: buildPendingPostIndex(posts),
            };
          }

          const nextPosts = state.posts.filter(
            (item) =>
              !matchesPendingPostAlias(
                item,
                pendingPost.post_id,
                pendingPost.optimistic_action_id,
              ),
          );
          const posts = [pendingPost, ...nextPosts].slice(0, 10);
          return { posts, postsById: buildPendingPostIndex(posts) };
        }),
      removePost: (postId, optimisticActionId) =>
        set((state) => {
          const posts = state.posts.filter((post) =>
            !matchesPendingPostAlias(post, postId, optimisticActionId),
          );
          return { posts, postsById: buildPendingPostIndex(posts) };
        }),
      removeExpiredPosts: () =>
        set((state) => {
          const previousPosts = Array.isArray(state.posts) ? state.posts : [];
          const posts = prunePendingPosts(previousPosts);
          const removedCount = previousPosts.length - posts.length;
          if (removedCount > 0) {
            Sentry.addBreadcrumb({
              category: "pending-posts",
              message: "Stale pending posts pruned",
              level: "info",
              data: { removedCount, remainingCount: posts.length },
            });
          }
          return { posts, postsById: buildPendingPostIndex(posts) };
        }),
      getPost: (postId) => selectPendingPost(get().postsById, postId),
      markPostError: (postId, errorMessage) =>
        set((state) => {
          const posts: ApiPost[] = state.posts.map((post) =>
            post.post_id === postId
              ? {
                  ...post,
                  optimistic_status: "error" as const,
                  optimistic_error: errorMessage,
                }
              : post,
          );
          return { posts, postsById: buildPendingPostIndex(posts) };
        }),
    }),
    {
      name: "pending-posts-storage",
      storage: createJSONStorage(() => walletScopedStorage),
      skipHydration: true,
      version: 5,
      migrate: (persistedState) => {
        const migrated = migratePendingPostsState(persistedState);
        const previousCount = Array.isArray((persistedState as { posts?: unknown })?.posts)
          ? ((persistedState as { posts: unknown[] }).posts.length)
          : 0;
        if (migrated.posts.length < previousCount) {
          Sentry.addBreadcrumb({
            category: "pending-posts",
            message: "Stale persisted pending posts pruned during migration",
            level: "info",
            data: {
              removedCount: previousCount - migrated.posts.length,
              remainingCount: migrated.posts.length,
            },
          });
        }
        return {
          ...migrated,
        } as PendingPostsState;
      },
      onRehydrateStorage: () => (state, error) => {
        if (!error) {
          state?.removeExpiredPosts();
        }
      },
      partialize: (state) => ({ posts: state.posts }),
    },
  ),
);

registerWalletScopedStore({
  storageName: "pending-posts-storage",
  reset: () => usePendingPostsStore.setState({ posts: [], postsById: {} }),
  rehydrate: () => usePendingPostsStore.persist.rehydrate(),
});
