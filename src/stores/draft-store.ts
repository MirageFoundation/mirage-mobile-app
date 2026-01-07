import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type Community = {
  id: string;
  name: string;
  avatar?: string;
  memberCount: number;
  description?: string;
  isSubscribed: boolean;
};

export type AttachmentType = "link" | "image" | "video" | "poll" | null;

export type PostDraft = {
  community: Community | null;
  topic: string | null;
  title: string;
  body: string;
  contentWarning: string[];
  mediaUris: string[];
  linkUrl: string | null;
  attachmentType: AttachmentType;
  tags: string[];
};

type DraftState = {
  draft: PostDraft;
  hasDraft: boolean;

  // Actions
  updateDraft: (partial: Partial<PostDraft>) => void;
  clearDraft: () => void;
  setAttachment: (type: AttachmentType, uri?: string) => void;
  removeAttachment: () => void;
};

const emptyDraft: PostDraft = {
  community: null,
  topic: null,
  title: "",
  body: "",
  contentWarning: [],
  mediaUris: [],
  linkUrl: null,
  attachmentType: null,
  tags: [],
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      draft: emptyDraft,
      hasDraft: false,

      updateDraft: (partial) =>
        set((state) => ({
          draft: { ...state.draft, ...partial },
          hasDraft: true,
        })),
      clearDraft: () => set({ draft: emptyDraft, hasDraft: false }),
      setAttachment: (type, uri) =>
        set((state) => ({
          draft: {
            ...state.draft,
            attachmentType: type,
            // Convert empty string to null for linkUrl
            linkUrl: type === "link" ? (uri && uri.length > 0 ? uri : null) : null,
            mediaUris:
              type === "image" || type === "video" ? (uri ? [uri] : []) : [],
          },
          hasDraft: true,
        })),
      removeAttachment: () =>
        set((state) => ({
          draft: {
            ...state.draft,
            attachmentType: null,
            linkUrl: null,
            mediaUris: [],
          },
        })),
    }),
    {
      name: "draft-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
