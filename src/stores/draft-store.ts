import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
 registerWalletScopedStore,
 walletScopedStorage,
} from "./wallet-scoped-storage";
import { EMPTY_POST_DRAFT, type AttachmentType, type PostDraft } from "@/src/domain/content";

export type { AttachmentType, Community, PostDraft } from "@/src/domain/content";

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
 replaceMediaUri: (oldUri: string, newUri: string) => void;
  removeAttachment: () => void;
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      draft: EMPTY_POST_DRAFT,
      hasDraft: false,

      updateDraft: (partial) =>
        set((state) => ({
          draft: { ...state.draft, ...partial },
          hasDraft: true,
        })),
      clearDraft: () => set({ draft: EMPTY_POST_DRAFT, hasDraft: false }),
      setAttachment: (type, uri) =>
        set((state) => {
          const mediaUris =
            type === "image" || type === "video"
              ? uri
                ? Array.from(new Set([...state.draft.mediaUris, uri])).slice(0, MAX_MEDIA_ITEMS)
                : state.draft.mediaUris
              : [];

          return {
            draft: {
              ...state.draft,
              attachmentType: type,
              linkUrl: type === "link" ? (uri && uri.length > 0 ? uri : null) : null,
              mediaUris,
            },
            hasDraft: true,
          };
        }),
      addMediaUri: (uri) =>
        set((state) => {
          const mediaUris = Array.from(new Set([...state.draft.mediaUris, uri])).slice(0, MAX_MEDIA_ITEMS);
          if (mediaUris.length === state.draft.mediaUris.length) return state;
          return {
            draft: {
              ...state.draft,
              attachmentType: "image",
              mediaUris,
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
      replaceMediaUri: (oldUri, newUri) =>
        set((state) => ({
          draft: {
            ...state.draft,
            mediaUris: Array.from(
              new Set(state.draft.mediaUris.map((u) => u === oldUri ? newUri : u))
            ),
          },
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
      storage: createJSONStorage(() => walletScopedStorage),
      skipHydration: true,
    }
  )
);

registerWalletScopedStore({
 storageName: "draft-storage",
 reset: () => useDraftStore.getState().clearDraft(),
 rehydrate: () => useDraftStore.persist.rehydrate(),
});
