import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Post as ApiPost } from "@/src/api/types";
import { mmkvStorage } from "./mmkv-storage";

type PendingPostsState = {
  posts: ApiPost[];
  upsertPost: (post: ApiPost) => void;
  removePost: (postId: string) => void;
  removeExpiredPosts: () => void;
  getPost: (postId: string) => ApiPost | undefined;
  markPostError: (postId: string, errorMessage: string) => void;
};

const OPTIMISTIC_SUCCESS_CACHE_MS = 2 * 60 * 1000;

const isPendingPostStatus = (post: ApiPost) =>
  post.optimistic_status === "pending" ||
  post.optimistic_status === "error" ||
  (post.optimistic_status === "success" &&
    (post.optimistic_cached_until ?? 0) > Date.now());

const withSuccessCacheTtl = (post: ApiPost): ApiPost =>
  post.optimistic_status === "success" && !post.optimistic_cached_until
    ? { ...post, optimistic_cached_until: Date.now() + OPTIMISTIC_SUCCESS_CACHE_MS }
    : post;

export const usePendingPostsStore = create<PendingPostsState>()(
  persist(
    (set, get) => ({
      posts: [] as ApiPost[],
      upsertPost: (post) =>
        set((state) => {
          const cachedPost = withSuccessCacheTtl(post);
          if (!isPendingPostStatus(cachedPost)) {
            return {
              posts: state.posts.filter((item) => item.post_id !== cachedPost.post_id),
            };
          }

          const nextPosts = state.posts.filter(
            (item) =>
              item.post_id !== cachedPost.post_id &&
              item.optimistic_action_id !== cachedPost.optimistic_action_id,
          );
          return { posts: [cachedPost, ...nextPosts].slice(0, 10) };
        }),
      removePost: (postId) =>
        set((state) => ({
          posts: state.posts.filter((post) => post.post_id !== postId),
        })),
      removeExpiredPosts: () =>
        set((state) => ({
          posts: state.posts.filter(isPendingPostStatus),
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
      version: 1,
      partialize: (state) => ({ posts: state.posts }),
    },
  ),
);
