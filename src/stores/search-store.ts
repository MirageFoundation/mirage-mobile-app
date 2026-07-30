import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  registerWalletScopedStore,
  walletScopedStorage,
} from "./wallet-scoped-storage";

export type RecentSearch = {
  id: string;
  query: string;
  timestamp: number;
};

type SearchState = {
  recentSearches: RecentSearch[];
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (id: string) => void;
  clearRecentSearches: () => void;
};

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      recentSearches: [],

      addRecentSearch: (query: string) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        const { recentSearches } = get();
        
        // Remove existing entry with same query (case insensitive)
        const filteredSearches = recentSearches.filter(
          (s) => s.query.toLowerCase() !== trimmedQuery.toLowerCase()
        );

        // Add new search at the beginning
        const newSearch: RecentSearch = {
          id: Date.now().toString(),
          query: trimmedQuery,
          timestamp: Date.now(),
        };

        // Keep only the last 10 searches
        const updatedSearches = [newSearch, ...filteredSearches].slice(0, 10);

        set({ recentSearches: updatedSearches });
      },

      removeRecentSearch: (id: string) => {
        set((state) => ({
          recentSearches: state.recentSearches.filter((s) => s.id !== id),
        }));
      },

      clearRecentSearches: () => {
        set({ recentSearches: [] });
      },
    }),
    {
      name: "search-storage",
      storage: createJSONStorage(() => walletScopedStorage),
      skipHydration: true,
    }
  )
);

registerWalletScopedStore({
  storageName: "search-storage",
  reset: () => useSearchStore.getState().clearRecentSearches(),
  rehydrate: () => useSearchStore.persist.rehydrate(),
});
