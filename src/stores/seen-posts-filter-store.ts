import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

const MAX_TRACKED = 5000;
const MAX_ACTIVE_FILTER = 200;

interface SeenPostsFilterState {
  seenPostIds: Set<string>;
  seenOrder: string[];
  activeFilterIds: Set<string>;
  addSeen: (postId: string) => void;
  addSeenBulk: (postIds: string[]) => void;
  activateFilter: () => void;
  clearAll: () => void;
  isSeen: (postId: string) => boolean;
}

export const useSeenPostsFilterStore = create<SeenPostsFilterState>()(
  persist(
    (set, get) => ({
      seenPostIds: new Set<string>(),
      seenOrder: [],
      activeFilterIds: new Set<string>(),

      addSeen: (postId: string) => {
        const id = postId.trim().toLowerCase();
        if (!id) return;
        const current = get().seenPostIds;
        if (current.has(id)) return;
        set((state) => {
          const next = new Set(state.seenPostIds);
          next.add(id);
          const order = [...state.seenOrder, id];
          while (order.length > MAX_TRACKED) {
            const oldest = order.shift();
            if (oldest) next.delete(oldest);
          }
          return { seenPostIds: next, seenOrder: order };
        });
      },

      addSeenBulk: (postIds: string[]) => {
        if (postIds.length === 0) return;
        set((state) => {
          const next = new Set(state.seenPostIds);
          const order = [...state.seenOrder];
          for (const raw of postIds) {
            const id = raw.trim().toLowerCase();
            if (!id || next.has(id)) continue;
            next.add(id);
            order.push(id);
          }
          while (order.length > MAX_TRACKED) {
            const oldest = order.shift();
            if (oldest) next.delete(oldest);
          }
          return { seenPostIds: next, seenOrder: order };
        });
      },

      activateFilter: () => {
        set((state) => {
          const recentIds = state.seenOrder.slice(-MAX_ACTIVE_FILTER);
          return { activeFilterIds: new Set(recentIds) };
        });
      },

      clearAll: () =>
        set({
          seenPostIds: new Set<string>(),
          seenOrder: [],
          activeFilterIds: new Set<string>(),
        }),

      isSeen: (postId: string) =>
        get().seenPostIds.has(postId.trim().toLowerCase()),
    }),
    {
      name: "seen-posts-filter",
      storage: createJSONStorage(() => mmkvStorage, {
        reviver: (key, value) => {
          if (
            (key === "seenPostIds" || key === "activeFilterIds") &&
            Array.isArray(value)
          ) {
            return new Set(value as string[]);
          }
          return value;
        },
        replacer: (_key, value) => {
          if (value instanceof Set) return Array.from(value);
          return value;
        },
      }),
      version: 2,
      partialize: (state) => ({
        seenPostIds: state.seenPostIds,
        seenOrder: state.seenOrder,
        activeFilterIds: state.activeFilterIds,
      }),
    },
  ),
);
