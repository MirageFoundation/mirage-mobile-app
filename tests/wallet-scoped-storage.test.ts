// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, mock, test } from "bun:test";

const records = new Map<string, string>();
const memoryStorage = {
  getItem: (name: string) => records.get(name) ?? null,
  setItem: (name: string, value: string) => {
    records.set(name, value);
  },
  removeItem: (name: string) => {
    records.delete(name);
  },
};

mock.module("../src/stores/mmkv-storage", () => ({
  mmkvStorage: memoryStorage,
}));

const {
  PERSISTED_STORE_OWNERSHIP,
  buildWalletStorageKey,
  registerWalletScopedStore,
  selectWalletStorageNamespace,
  walletScopedStorage,
} = await import("../src/stores/wallet-scoped-storage");

const unregisterCallbacks: (() => void)[] = [];

type TestState = Record<string, unknown>;

function createStore(
  storageName: string,
  initialState: TestState,
) {
  let state = structuredClone(initialState);
  const unregister = registerWalletScopedStore({
    storageName,
    reset: () => {
      state = structuredClone(initialState);
    },
    rehydrate: async () => {
      const persisted = await walletScopedStorage.getItem(storageName);
      if (persisted) state = JSON.parse(persisted);
    },
  });
  unregisterCallbacks.push(unregister);

  return {
    get: () => state,
    set: async (nextState: TestState) => {
      state = structuredClone(nextState);
      await walletScopedStorage.setItem(storageName, JSON.stringify(state));
    },
  };
}

afterEach(async () => {
  while (unregisterCallbacks.length > 0) unregisterCallbacks.pop()?.();
  records.clear();
  await selectWalletStorageNamespace(null, memoryStorage);
});

describe("wallet-scoped client persistence", () => {
  test("declares every persisted store as wallet- or device-owned", () => {
    expect(PERSISTED_STORE_OWNERSHIP).toEqual({
      "auth-storage": "device",
      "preferences-storage": "device",
      "pending-posts-storage": "wallet",
      "comment-compose-storage": "wallet",
      "inbox-store": "wallet",
      "saved-posts-storage": "wallet",
      "history-storage": "wallet",
      "search-storage": "wallet",
      "draft-storage": "wallet",
      "content-moderation-storage": "wallet",
    });
  });

  test("restores wallet A after logout without exposing it to wallet B", async () => {
    const store = createStore("saved-posts-storage", { savedPosts: [] });

    await selectWalletStorageNamespace(" MIRAGE1WALLET-A ", memoryStorage);
    await store.set({ savedPosts: ["post-a"] });
    await selectWalletStorageNamespace(null, memoryStorage);
    expect(store.get()).toEqual({ savedPosts: [] });

    await selectWalletStorageNamespace("mirage1wallet-b", memoryStorage);
    expect(store.get()).toEqual({ savedPosts: [] });
    await store.set({ savedPosts: ["post-b"] });

    await selectWalletStorageNamespace("mirage1wallet-a", memoryStorage);
    expect(store.get()).toEqual({ savedPosts: ["post-a"] });
  });

  test("rotates state safely during direct wallet import replacement", async () => {
    const store = createStore("comment-compose-storage", { drafts: {} });

    await selectWalletStorageNamespace("wallet-a", memoryStorage);
    await store.set({ drafts: { post: { text: "wallet A draft" } } });
    await selectWalletStorageNamespace("wallet-b", memoryStorage);

    expect(store.get()).toEqual({ drafts: {} });
    expect(records.get(buildWalletStorageKey("comment-compose-storage", "wallet-a"))).toContain(
      "wallet A draft",
    );
  });

  test("keeps anonymous startup empty and drops anonymous writes", async () => {
    const store = createStore("history-storage", { entries: [] });
    records.set(
      buildWalletStorageKey("history-storage", "wallet-a"),
      JSON.stringify({ entries: ["private-history"] }),
    );

    await selectWalletStorageNamespace(null, memoryStorage);
    await store.set({ entries: ["anonymous-history"] });

    expect(store.get()).toEqual({ entries: ["anonymous-history"] });
    expect(records.size).toBe(1);
    await selectWalletStorageNamespace("wallet-a", memoryStorage);
    expect(store.get()).toEqual({ entries: ["private-history"] });
  });

  test("fully resets inbox metadata including lastViewedAt", async () => {
    const emptyInbox = {
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
    };
    const store = createStore("inbox-store", emptyInbox);

    await selectWalletStorageNamespace("wallet-a", memoryStorage);
    await store.set({
      unreadCount: 3,
      hasUnread: true,
      isInboxActive: true,
      lastViewedAt: 42,
      highlightBaselineAt: 41,
      latestInboxTimestamp: 43,
      _suppressUntil: 99,
      readReplyIds: ["reply-a"],
      notificationTarget: { notificationId: "notification-a" },
      notificationNavigationStartedAt: 44,
    });
    await selectWalletStorageNamespace(null, memoryStorage);

    expect(store.get()).toEqual(emptyInbox);
  });

  test("discards ambiguous legacy unscoped data instead of migrating it", async () => {
    const store = createStore("search-storage", { recentSearches: [] });
    records.set(
      "search-storage",
      JSON.stringify({ recentSearches: ["wallet-unknown-search"] }),
    );

    await selectWalletStorageNamespace("wallet-b", memoryStorage);

    expect(records.has("search-storage")).toBe(false);
    expect(store.get()).toEqual({ recentSearches: [] });
  });
});
