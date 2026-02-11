import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

interface InboxState {
  unreadReplyIds: string[];
  hasUnread: boolean;
  addUnreadReplyIds: (ids: string[]) => void;
  markAllAsRead: () => void;
}

export const useInboxStore = create<InboxState>()(
  persist(
    (set) => ({
      unreadReplyIds: [],
      hasUnread: false,

      addUnreadReplyIds: (ids: string[]) =>
        set((state) => {
          const existing = new Set(state.unreadReplyIds);
          const newIds = ids.filter((id) => !existing.has(id));
          if (newIds.length === 0) return state;
          const updated = [...state.unreadReplyIds, ...newIds];
          return { unreadReplyIds: updated, hasUnread: updated.length > 0 };
        }),

      markAllAsRead: () => set({ unreadReplyIds: [], hasUnread: false }),
    }),
    {
      name: "inbox-store",
      version: 1,
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        unreadReplyIds: state.unreadReplyIds,
        hasUnread: state.hasUnread,
      }),
      migrate: () => ({
        unreadReplyIds: [],
        hasUnread: false,
      }),
    },
  ),
);
