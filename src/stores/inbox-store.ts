import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

interface InboxState {
  unreadCount: number;
  hasUnread: boolean;
  lastViewedAt: number;
  setUnreadCount: (count: number) => void;
  markAsViewed: (serverTimestamp?: number) => void;
}

export const useInboxStore = create<InboxState>()(
  persist(
    (set) => ({
      unreadCount: 0,
      hasUnread: false,
      lastViewedAt: 0,

      setUnreadCount: (count: number) =>
        set({ unreadCount: count, hasUnread: count > 0 }),

      markAsViewed: (serverTimestamp?: number) =>
        set({
          unreadCount: 0,
          hasUnread: false,
          lastViewedAt: serverTimestamp ?? Math.floor(Date.now() / 1000),
        }),
    }),
    {
      name: "inbox-store",
      version: 3,
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        unreadCount: state.unreadCount,
        hasUnread: state.hasUnread,
        lastViewedAt: state.lastViewedAt,
      }),
      migrate: () => ({
        unreadCount: 0,
        hasUnread: false,
        lastViewedAt: 0,
      }),
    },
  ),
);
