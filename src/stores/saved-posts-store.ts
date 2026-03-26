import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Comment } from "@/src/domain/comments/types";
import type { Post } from "@/src/domain/posts/types";
import { mmkvStorage } from "./mmkv-storage";

export type SavedPost = Post & {
  savedAt: number;
};

export type SavedComment = Comment & {
  savedAt: number;
  rootPostId?: string;
};

interface SavedPostsState {
  savedPosts: SavedPost[];
  savedComments: SavedComment[];
  savePost: (post: Post) => void;
  unsavePost: (postId: string) => void;
  toggleSavePost: (post: Post) => boolean;
  isPostSaved: (postId: string) => boolean;
  saveComment: (comment: Comment, rootPostId?: string) => void;
  unsaveComment: (commentId: string) => void;
  toggleSaveComment: (comment: Comment, rootPostId?: string) => boolean;
  isCommentSaved: (commentId: string) => boolean;
  clearAll: () => void;
}

export const useSavedPostsStore = create<SavedPostsState>()(
  persist(
    (set, get) => ({
      savedPosts: [],
      savedComments: [],

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

      saveComment: (comment: Comment, rootPostId?: string) => {
        const existing = get().savedComments.find((c) => c.id === comment.id);
        if (existing) return;
        set((state) => ({
          savedComments: [
            { ...comment, savedAt: Date.now(), rootPostId },
            ...state.savedComments,
          ],
        }));
      },

      unsaveComment: (commentId: string) => {
        set((state) => ({
          savedComments: state.savedComments.filter((c) => c.id !== commentId),
        }));
      },

      toggleSaveComment: (comment: Comment, rootPostId?: string) => {
        const isSaved = get().savedComments.some((c) => c.id === comment.id);
        if (isSaved) {
          get().unsaveComment(comment.id);
          return false;
        } else {
          get().saveComment(comment, rootPostId);
          return true;
        }
      },

      isCommentSaved: (commentId: string) => {
        return get().savedComments.some((c) => c.id === commentId);
      },

      clearAll: () => {
        set({ savedPosts: [], savedComments: [] });
      },
    }),
    {
      name: "saved-posts-storage",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
