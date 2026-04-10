import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

const DRAFT_TTL_MS = 2 * 24 * 60 * 60 * 1000;

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
  savedAt: number;
};

function getDraftKey(postId: string, replyToId?: string | null): string {
  return replyToId ? `${postId}:${replyToId}` : postId;
}

function isExpired(draft: CommentDraft): boolean {
  return Date.now() - draft.savedAt > DRAFT_TTL_MS;
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
  saveDraft: (postId: string, replyToId: string | null | undefined, draft: Omit<CommentDraft, "savedAt">) => void;
  getDraft: (postId: string, replyToId: string | null | undefined) => CommentDraft | null;
  clearDraft: (postId: string, replyToId: string | null | undefined) => void;
  purgeExpiredDrafts: () => void;
};

export const useCommentComposeStore = create<CommentComposeState>()(
  persist(
    (set, get) => ({
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
          return { drafts: { ...state.drafts, [key]: { ...draft, savedAt: Date.now() } } };
        });
      },
      getDraft: (postId, replyToId) => {
        const key = getDraftKey(postId, replyToId);
        const draft = get().drafts[key];
        if (!draft) return null;
        if (isExpired(draft)) {
          const { [key]: _, ...rest } = get().drafts;
          set({ drafts: rest });
          return null;
        }
        return draft;
      },
      clearDraft: (postId, replyToId) => {
        const key = getDraftKey(postId, replyToId);
        set((state) => {
          const { [key]: _, ...rest } = state.drafts;
          return { drafts: rest };
        });
      },
      purgeExpiredDrafts: () => {
        set((state) => {
          const kept: Record<string, CommentDraft> = {};
          for (const [key, draft] of Object.entries(state.drafts)) {
            if (!isExpired(draft)) kept[key] = draft;
          }
          return { drafts: kept };
        });
      },
    }),
    {
      name: "comment-compose-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
