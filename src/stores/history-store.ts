import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";
import type { Post } from "@/src/components/molecules/post-card-types";

export type HistoryEntry = Post & {
  viewedAt: number;
};

const MAX_HISTORY = 100;

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (post: Post) => void;
  removeEntry: (postId: string) => void;
  clearAll: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (post: Post) => {
        set((state) => {
          const filtered = state.entries.filter((e) => e.id !== post.id);
          const updated = [{ ...post, viewedAt: Date.now() }, ...filtered];
          return { entries: updated.slice(0, MAX_HISTORY) };
        });
      },

      removeEntry: (postId: string) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== postId),
        }));
      },

      clearAll: () => {
        set({ entries: [] });
      },
    }),
    {
      name: "history-storage",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
