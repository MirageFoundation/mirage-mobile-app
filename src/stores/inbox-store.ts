import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

interface InboxState {
  unreadCount: number;
  hasUnread: boolean;
  lastViewedAt: number;
  latestInboxTimestamp: number;
  _suppressUntil: number;
  setUnreadCount: (count: number) => void;
  setLatestInboxTimestamp: (timestamp: number) => void;
  markAsViewed: (serverTimestamp?: number) => void;
}

export const useInboxStore = create<InboxState>()(
  persist(
    (set, get) => ({
      unreadCount: 0,
      hasUnread: false,
      lastViewedAt: 0,
      latestInboxTimestamp: 0,
      _suppressUntil: 0,

      setUnreadCount: (count: number) => {
        if (Date.now() < get()._suppressUntil) return;
        const normalized = Math.max(0, Math.trunc(count));
        set({ unreadCount: normalized, hasUnread: normalized > 0 });
      },

      setLatestInboxTimestamp: (timestamp: number) => {
        const normalized = Math.max(0, Math.trunc(timestamp));
        if (!normalized) return;
        set((state) => ({
          latestInboxTimestamp: Math.max(state.latestInboxTimestamp, normalized),
        }));
      },

      markAsViewed: (serverTimestamp?: number) =>
        set({
          unreadCount: 0,
          hasUnread: false,
          lastViewedAt: serverTimestamp ?? Math.floor(Date.now() / 1000),
          _suppressUntil: Date.now() + 5_000,
        }),
    }),
    {
      name: "inbox-store",
      version: 4,
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        lastViewedAt: state.lastViewedAt,
      }),
      migrate: () => ({
        unreadCount: 0,
        hasUnread: false,
        lastViewedAt: 0,
        latestInboxTimestamp: 0,
        _suppressUntil: 0,
      }),
    },
  ),
);
