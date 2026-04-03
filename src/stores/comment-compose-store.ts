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

type CommentDraft = {
  text: string;
  imageUri?: string | null;
  gifUrl?: string | null;
};

function getDraftKey(postId: string, replyToId?: string | null): string {
  return replyToId ? `${postId}:${replyToId}` : postId;
}

type CommentComposeState = {
  pendingComment: PendingComment | null;
  setPendingComment: (comment: PendingComment | null) => void;
  clearPendingComment: () => void;
  pendingEdit: PendingEdit | null;
  setPendingEdit: (edit: PendingEdit | null) => void;
  clearPendingEdit: () => void;
  wasDismissed: boolean;
  setWasDismissed: (dismissed: boolean) => void;
  drafts: Record<string, CommentDraft>;
  saveDraft: (postId: string, replyToId: string | null | undefined, draft: CommentDraft) => void;
  getDraft: (postId: string, replyToId: string | null | undefined) => CommentDraft | null;
  clearDraft: (postId: string, replyToId: string | null | undefined) => void;
};

export const useCommentComposeStore = create<CommentComposeState>((set, get) => ({
  pendingComment: null,
  setPendingComment: (comment) => set({ pendingComment: comment }),
  clearPendingComment: () => set({ pendingComment: null }),
  pendingEdit: null,
  setPendingEdit: (edit) => set({ pendingEdit: edit }),
  clearPendingEdit: () => set({ pendingEdit: null }),
  wasDismissed: false,
  setWasDismissed: (dismissed) => set({ wasDismissed: dismissed }),
  drafts: {},
  saveDraft: (postId, replyToId, draft) => {
    const key = getDraftKey(postId, replyToId);
    const hasContent = draft.text.trim().length > 0 || !!draft.imageUri || !!draft.gifUrl;
    set((state) => {
      if (!hasContent) {
        const { [key]: _, ...rest } = state.drafts;
        return { drafts: rest };
      }
      return { drafts: { ...state.drafts, [key]: draft } };
    });
  },
  getDraft: (postId, replyToId) => {
    const key = getDraftKey(postId, replyToId);
    return get().drafts[key] || null;
  },
  clearDraft: (postId, replyToId) => {
    const key = getDraftKey(postId, replyToId);
    set((state) => {
      const { [key]: _, ...rest } = state.drafts;
      return { drafts: rest };
    });
  },
}));
