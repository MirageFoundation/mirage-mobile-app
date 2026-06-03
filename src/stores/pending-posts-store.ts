import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Post as ApiPost } from "@/src/api/types";
import { mmkvStorage } from "./mmkv-storage";

type PendingPostsState = {
  posts: ApiPost[];
  upsertPost: (post: ApiPost) => void;
  removePost: (postId: string) => void;
  markPostError: (postId: string, errorMessage: string) => void;
};

const isPendingPostStatus = (post: ApiPost) =>
  post.optimistic_status === "pending" || post.optimistic_status === "error";

export const usePendingPostsStore = create<PendingPostsState>()(
  persist(
    (set) => ({
      posts: [],
      upsertPost: (post) =>
        set((state) => {
          if (!isPendingPostStatus(post)) {
            return {
              posts: state.posts.filter((item) => item.post_id !== post.post_id),
            };
          }

          const nextPosts = state.posts.filter(
            (item) =>
              item.post_id !== post.post_id &&
              item.optimistic_action_id !== post.optimistic_action_id,
          );
          return { posts: [post, ...nextPosts].slice(0, 10) };
        }),
      removePost: (postId) =>
        set((state) => ({
          posts: state.posts.filter((post) => post.post_id !== postId),
        })),
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
