import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";
import type { Post } from "@/src/components/molecules/post-card-types";

export type SavedPost = Post & {
  savedAt: number;
};

interface SavedPostsState {
  savedPosts: SavedPost[];
  savePost: (post: Post) => void;
  unsavePost: (postId: string) => void;
  toggleSavePost: (post: Post) => boolean;
  isPostSaved: (postId: string) => boolean;
  clearAll: () => void;
}

export const useSavedPostsStore = create<SavedPostsState>()(
  persist(
    (set, get) => ({
      savedPosts: [],

      savePost: (post: Post) => {
        const existing = get().savedPosts.find((p) => p.id === post.id);
        if (existing) return;
        set((state) => ({
          savedPosts: [{ ...post, savedAt: Date.now() }, ...state.savedPosts],
        }));
      },

      unsavePost: (postId: string) => {
        set((state) => ({
          savedPosts: state.savedPosts.filter((p) => p.id !== postId),
        }));
      },

      toggleSavePost: (post: Post) => {
        const isSaved = get().savedPosts.some((p) => p.id === post.id);
        if (isSaved) {
          get().unsavePost(post.id);
          return false;
        } else {
          get().savePost(post);
          return true;
        }
      },

      isPostSaved: (postId: string) => {
        return get().savedPosts.some((p) => p.id === postId);
      },

      clearAll: () => {
        set({ savedPosts: [] });
      },
    }),
    {
      name: "saved-posts-storage",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
