import { create } from "zustand";

type PendingComment = {
  postId: string;
  replyToId?: string | null;
  text: string;
  imageUri?: string | null;
  gifUrl?: string | null;
  mediaUris?: string[];
};

type PendingEdit = {
  postId: string;
  source: "post" | "profile";
  commentId: string;
  parentId: string;
  text: string;
  imageUri?: string | null;
  gifUrl?: string | null;
  mediaUris?: string[];
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
