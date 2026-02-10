import { create } from "zustand";

type PendingComment = {
  text: string;
  imageUri?: string | null;
  gifUrl?: string | null;
};

type PendingEdit = {
  commentId: string;
  parentId: string;
  text: string;
  imageUri?: string | null;
  gifUrl?: string | null;
};

type CommentComposeState = {
  pendingComment: PendingComment | null;
  setPendingComment: (comment: PendingComment | null) => void;
  clearPendingComment: () => void;
  pendingEdit: PendingEdit | null;
  setPendingEdit: (edit: PendingEdit | null) => void;
  clearPendingEdit: () => void;
  wasDismissed: boolean;
  setWasDismissed: (dismissed: boolean) => void;
};

export const useCommentComposeStore = create<CommentComposeState>((set) => ({
  pendingComment: null,
  setPendingComment: (comment) => set({ pendingComment: comment }),
  clearPendingComment: () => set({ pendingComment: null }),
  pendingEdit: null,
  setPendingEdit: (edit) => set({ pendingEdit: edit }),
  clearPendingEdit: () => set({ pendingEdit: null }),
  wasDismissed: false,
  setWasDismissed: (dismissed) => set({ wasDismissed: dismissed }),
}));
