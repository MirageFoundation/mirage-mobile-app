import { create } from "zustand";

type PendingComment = {
  text: string;
  imageUri?: string | null;
  gifUrl?: string | null;
};

type CommentComposeState = {
  pendingComment: PendingComment | null;
  setPendingComment: (comment: PendingComment | null) => void;
  clearPendingComment: () => void;
  wasDismissed: boolean;
  setWasDismissed: (dismissed: boolean) => void;
};

export const useCommentComposeStore = create<CommentComposeState>((set) => ({
  pendingComment: null,
  setPendingComment: (comment) => set({ pendingComment: comment }),
  clearPendingComment: () => set({ pendingComment: null }),
  wasDismissed: false,
  setWasDismissed: (dismissed) => set({ wasDismissed: dismissed }),
}));
