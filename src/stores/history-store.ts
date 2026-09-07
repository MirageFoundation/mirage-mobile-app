import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  registerWalletScopedStore,
  walletScopedStorage,
} from "./wallet-scoped-storage";
import type { Post } from "@/src/domain/content";
import { migratePersistedCommunityPost } from "./persisted-community-post";

export type HistoryEntry = Post & {
  viewedAt: number;
};

function normalizeHistoryEntry(entry: HistoryEntry): HistoryEntry {
  if (entry.likes === 0 && entry.dislikes > 0) {
    return {
      ...entry,
      likes: -entry.dislikes,
    };
  }

  return entry;
}

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
          const updated = [normalizeHistoryEntry({ ...post, viewedAt: Date.now() }), ...filtered];
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
      storage: createJSONStorage(() => walletScopedStorage),
      skipHydration: true,
      version: 3,
      migrate: (persistedState) => {
        const state = persistedState as {
          entries?: HistoryEntry[];
        };

        return {
          ...state,
          entries: (state.entries ?? [])
            .map((entry) => migratePersistedCommunityPost(entry as HistoryEntry & Record<string, unknown>))
            .filter((entry): entry is HistoryEntry & { community: string } => !!entry)
            .map((entry) => normalizeHistoryEntry(entry as HistoryEntry)),
        };
      },
    },
  ),
);

registerWalletScopedStore({
  storageName: "history-storage",
  reset: () => useHistoryStore.getState().clearAll(),
  rehydrate: () => useHistoryStore.persist.rehydrate(),
});
