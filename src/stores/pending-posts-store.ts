import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Post as ApiPost } from "@/src/api/types";
import { mmkvStorage } from "./mmkv-storage";
import {
  matchesPendingPostAlias,
  normalizePendingPost,
  prunePendingPosts,
} from "./pending-posts-lifecycle";

type PendingPostsState = {
  posts: ApiPost[];
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
      upsertPost: (post) =>
        set((state) => {
          const pendingPost = normalizePendingPost(post);
          if (!pendingPost) {
            return {
              posts: state.posts.filter((item) => !matchesPendingPostAlias(
                item,
                post.post_id,
                post.optimistic_action_id,
              )),
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
          return { posts: [pendingPost, ...nextPosts].slice(0, 10) };
        }),
      removePost: (postId, optimisticActionId) =>
        set((state) => ({
          posts: state.posts.filter((post) =>
            !matchesPendingPostAlias(post, postId, optimisticActionId),
          ),
        })),
      removeExpiredPosts: () =>
        set((state) => ({
          posts: prunePendingPosts(state.posts),
        })),
      getPost: (postId) => {
        const normalizedPostId = postId.toLowerCase();
        return get()
          .posts.find((post) => post.post_id.toLowerCase() === normalizedPostId);
      },
      markPostError: (postId, errorMessage) =>
        set((state) => ({
          posts: state.posts.map((post) =>
            post.post_id === postId
              ? {
                  ...post,
                  optimistic_status: "error",
                  optimistic_error: errorMessage,
                }
              : post,
          ),
        })),
    }),
    {
      name: "pending-posts-storage",
      storage: createJSONStorage(() => mmkvStorage),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PendingPostsState> | undefined;
        return {
          ...state,
          posts: prunePendingPosts(state?.posts ?? []),
        } as PendingPostsState;
      },
      onRehydrateStorage: () => (state) => {
        state?.removeExpiredPosts();
      },
      partialize: (state) => ({ posts: state.posts }),
    },
  ),
);
