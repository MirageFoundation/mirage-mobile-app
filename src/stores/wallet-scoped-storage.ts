import type { StateStorage } from "zustand/middleware";

import { mmkvStorage } from "./mmkv-storage";

const WALLET_STORAGE_SCHEMA_VERSION = 1;

export const PERSISTED_STORE_OWNERSHIP = {
  "auth-storage": "device",
  "preferences-storage": "device",
  "pending-posts-storage": "wallet",
  "comment-compose-storage": "wallet",
  "inbox-store": "wallet",
  "saved-posts-storage": "wallet",
  "history-storage": "wallet",
  "search-storage": "wallet",
  "draft-storage": "wallet",
} as const satisfies Record<string, "device" | "wallet">;

type WalletScopedStoreController = {
  storageName: string;
  reset: () => void;
  rehydrate: () => Promise<void> | void;
};

let activeWalletIdentity: string | null = null;
const controllers = new Map<string, WalletScopedStoreController>();

export function normalizeWalletStorageIdentity(
  walletIdentity: string | null | undefined,
): string | null {
  const normalized = walletIdentity?.trim().toLowerCase();
  return normalized || null;
}

export function buildWalletStorageKey(
  storageName: string,
  walletIdentity: string,
): string {
  const normalized = normalizeWalletStorageIdentity(walletIdentity);
  if (!normalized) {
    throw new Error("A wallet identity is required for wallet-scoped storage");
  }

  return `${storageName}:wallet:v${WALLET_STORAGE_SCHEMA_VERSION}:${encodeURIComponent(normalized)}`;
}

export function createWalletScopedStateStorage(
  baseStorage: StateStorage = mmkvStorage,
): StateStorage {
  return {
    getItem: (name) => {
      if (!activeWalletIdentity) return null;
      return baseStorage.getItem(buildWalletStorageKey(name, activeWalletIdentity));
    },
    setItem: (name, value) => {
      if (!activeWalletIdentity) return;
      return baseStorage.setItem(
        buildWalletStorageKey(name, activeWalletIdentity),
        value,
      );
    },
    removeItem: (name) => {
      if (!activeWalletIdentity) return;
      return baseStorage.removeItem(
        buildWalletStorageKey(name, activeWalletIdentity),
      );
    },
  };
}

export const walletScopedStorage = createWalletScopedStateStorage();

export function registerWalletScopedStore(
  controller: WalletScopedStoreController,
): () => void {
  controllers.set(controller.storageName, controller);
  return () => controllers.delete(controller.storageName);
}

export async function selectWalletStorageNamespace(
  walletIdentity: string | null | undefined,
  baseStorage: StateStorage = mmkvStorage,
): Promise<void> {
  const nextIdentity = normalizeWalletStorageIdentity(walletIdentity);

  // Reset while writes are disabled so one wallet's in-memory state can never be
  // persisted into the namespace selected for another wallet.
  activeWalletIdentity = null;
  for (const controller of controllers.values()) {
    controller.reset();
    // Legacy records were unscoped and their owner cannot be established safely.
    await baseStorage.removeItem(controller.storageName);
  }

  activeWalletIdentity = nextIdentity;
  if (!nextIdentity) return;

  await Promise.all(
    Array.from(controllers.values(), (controller) => controller.rehydrate()),
  );
}
