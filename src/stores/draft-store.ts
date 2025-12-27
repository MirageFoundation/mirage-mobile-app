import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type PostDraft = {
  topic: string | null;
  title: string;
  body: string;
  contentWarning: string[];
  mediaUris: string[];
};

type DraftState = {
  draft: PostDraft;
  hasDraft: boolean;

  // Actions
  updateDraft: (partial: Partial<PostDraft>) => void;
  clearDraft: () => void;
};

const emptyDraft: PostDraft = {
  topic: null,
  title: "",
  body: "",
  contentWarning: [],
  mediaUris: [],
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
    }),
    {
      name: "draft-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);

