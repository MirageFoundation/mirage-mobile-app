import { create } from "zustand";

export interface PostEditOverride {
  title: string;
  content: string;
  topic?: string;
  tag?: string;
  media?: string[];
  editedAt: number;
}

interface PostEditStore {
  overrides: Record<string, PostEditOverride>;
  setOverride: (postId: string, override: PostEditOverride) => void;
  clearOverride: (postId: string) => void;
  clearAll: () => void;
}

export const usePostEditStore = create<PostEditStore>((set) => ({
  overrides: {},
  setOverride: (postId, override) =>
    set((s) => ({ overrides: { ...s.overrides, [postId]: override } })),
  clearOverride: (postId) =>
    set((s) => {
      const next = { ...s.overrides };
      delete next[postId];
      return { overrides: next };
    }),
  clearAll: () => set({ overrides: {} }),
}));
