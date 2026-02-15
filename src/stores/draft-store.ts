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
  isNewTopic?: boolean;
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

const MAX_MEDIA_ITEMS = 10;

type DraftState = {
  draft: PostDraft;
  hasDraft: boolean;

  // Actions
  updateDraft: (partial: Partial<PostDraft>) => void;
  clearDraft: () => void;
  setAttachment: (type: AttachmentType, uri?: string) => void;
  addMediaUri: (uri: string) => void;
  removeMediaUri: (uri: string) => void;
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
            linkUrl: type === "link" ? (uri && uri.length > 0 ? uri : null) : null,
            mediaUris:
              type === "image"
                ? uri
                  ? [...state.draft.mediaUris, uri].slice(0, MAX_MEDIA_ITEMS)
                  : state.draft.mediaUris
                : type === "video"
                  ? uri ? [uri] : []
                  : [],
          },
          hasDraft: true,
        })),
      addMediaUri: (uri) =>
        set((state) => {
          if (state.draft.mediaUris.length >= MAX_MEDIA_ITEMS) return state;
          return {
            draft: {
              ...state.draft,
              attachmentType: "image",
              mediaUris: [...state.draft.mediaUris, uri],
            },
            hasDraft: true,
          };
        }),
      removeMediaUri: (uri) =>
        set((state) => {
          const filtered = state.draft.mediaUris.filter((u) => u !== uri);
          return {
            draft: {
              ...state.draft,
              mediaUris: filtered,
              attachmentType: filtered.length === 0 ? null : state.draft.attachmentType,
            },
          };
        }),
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
