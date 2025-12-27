import { create } from "zustand";

type UIState = {
  authSheetVisible: boolean;
  commentOptionsPostId: string | null;

  // Actions
  showAuthSheet: () => void;
  hideAuthSheet: () => void;
  showCommentOptions: (postId: string) => void;
  hideCommentOptions: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  authSheetVisible: false,
  commentOptionsPostId: null,

  showAuthSheet: () => set({ authSheetVisible: true }),
  hideAuthSheet: () => set({ authSheetVisible: false }),
  showCommentOptions: (postId) => set({ commentOptionsPostId: postId }),
  hideCommentOptions: () => set({ commentOptionsPostId: null }),
}));

