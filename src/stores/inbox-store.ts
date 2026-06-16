import type { InboxReply } from "@/src/api/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

interface InboxNotificationTarget {
  notificationId: string;
  replyId: string | null;
  rootPostId: string | null;
  previewReply: InboxReply | null;
  receivedAt: number;
}

interface InboxState {
  unreadCount: number;
  hasUnread: boolean;
  isInboxActive: boolean;
  lastViewedAt: number;
  highlightBaselineAt: number;
  latestInboxTimestamp: number;
  _suppressUntil: number;
  readReplyIds: string[];
  notificationTarget: InboxNotificationTarget | null;
  notificationNavigationStartedAt: number;
  setUnreadCount: (count: number) => void;
  setLatestInboxTimestamp: (timestamp: number) => void;
  markAsViewed: (serverTimestamp?: number) => void;
  markReplyAsRead: (replyId: string) => void;
  advanceHighlightBaseline: () => void;
  setInboxActive: (active: boolean) => void;
  setNotificationTarget: (target: Omit<InboxNotificationTarget, "receivedAt">) => void;
  clearNotificationTarget: (notificationId?: string) => void;
  markNotificationNavigationActive: () => void;
  resetForLogout: () => void;
}

export const useInboxStore = create<InboxState>()(
  persist(
    (set, get) => ({
      unreadCount: 0,
      hasUnread: false,
      isInboxActive: false,
      lastViewedAt: 0,
      highlightBaselineAt: 0,
      latestInboxTimestamp: 0,
      _suppressUntil: 0,
      readReplyIds: [],
      notificationTarget: null,
      notificationNavigationStartedAt: 0,

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

      markReplyAsRead: (replyId: string) =>
        set((state) => {
          if (state.readReplyIds.includes(replyId)) return state;
          const updated = [...state.readReplyIds, replyId];
          const trimmed = updated.length > 500 ? updated.slice(-500) : updated;
          return { readReplyIds: trimmed };
        }),

      advanceHighlightBaseline: () =>
        set({
          highlightBaselineAt: Math.floor(Date.now() / 1000),
          readReplyIds: [],
        }),

      setInboxActive: (active: boolean) => set({ isInboxActive: active }),

      setNotificationTarget: (target) =>
        set({
          notificationTarget: {
            ...target,
            receivedAt: Date.now(),
          },
        }),

      clearNotificationTarget: (notificationId) =>
        set((state) => {
          if (
            notificationId &&
            state.notificationTarget?.notificationId !== notificationId
          ) {
            return state;
          }
          return { notificationTarget: null };
        }),

      markNotificationNavigationActive: () =>
        set({ notificationNavigationStartedAt: Date.now() }),

      resetForLogout: () =>
        set({
          unreadCount: 0,
          hasUnread: false,
          isInboxActive: false,
          latestInboxTimestamp: 0,
          highlightBaselineAt: Math.floor(Date.now() / 1000),
          _suppressUntil: 0,
          readReplyIds: [],
          notificationTarget: null,
          notificationNavigationStartedAt: 0,
        }),
    }),
    {
      name: "inbox-store",
      version: 6,
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        lastViewedAt: state.lastViewedAt,
        highlightBaselineAt: state.highlightBaselineAt,
        readReplyIds: state.readReplyIds,
      }),
      migrate: (persisted: any) => ({
        unreadCount: 0,
        hasUnread: false,
        lastViewedAt: persisted?.lastViewedAt ?? 0,
        highlightBaselineAt: persisted?.highlightBaselineAt ?? persisted?.lastViewedAt ?? 0,
        latestInboxTimestamp: 0,
        _suppressUntil: 0,
        readReplyIds: persisted?.readReplyIds ?? [],
        notificationTarget: null,
        notificationNavigationStartedAt: 0,
      }),
    },
  ),
);
