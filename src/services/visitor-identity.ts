export const VISITOR_ID_STORAGE_KEY = "mirage_analytics_visitor_id";
const MIN_VISITOR_ID_LENGTH = 8;

export type VisitorIdentityStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

type StorageProvider =
  | VisitorIdentityStorage
  | null
  | (() => VisitorIdentityStorage | null);

type VisitorIdentityTestConfig = {
  storage?: StorageProvider;
  randomUUID?: () => string;
};

let testConfig: VisitorIdentityTestConfig | null = null;
let memoizedVisitorId: string | null = null;

function isUsableVisitorId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= MIN_VISITOR_ID_LENGTH;
}

function acquireStorage(): VisitorIdentityStorage | null {
  try {
    const provider = testConfig?.storage;
    if (provider !== undefined) {
      return typeof provider === "function" ? provider() : provider;
    }
    // mmkv-storage constructs MMKV at import time; guard acquisition too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("../stores/mmkv-storage") as {
      storage?: VisitorIdentityStorage;
    };
    return loaded.storage ?? null;
  } catch {
    return null;
  }
}

function createRandomVisitorId(): string {
  try {
    if (testConfig?.randomUUID) {
      const injected = testConfig.randomUUID();
      if (isUsableVisitorId(injected)) return injected.trim();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Crypto = require("expo-crypto") as { randomUUID?: () => string };
      const generated = Crypto.randomUUID?.();
      if (isUsableVisitorId(generated)) return generated.trim();
    }
  } catch {
    // Fall through to a session-only id. Persistence is not claimed.
  }
  return `tmp-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function readStoredVisitorId(storage: VisitorIdentityStorage): string | null {
  try {
    const value = storage.getString(VISITOR_ID_STORAGE_KEY);
    return isUsableVisitorId(value) ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredVisitorId(storage: VisitorIdentityStorage, id: string): void {
  try {
    storage.set(VISITOR_ID_STORAGE_KEY, id);
  } catch {
    // Keep the in-memory id. Do not claim restart persistence.
  }
}

export function getVisitorId(): string {
  if (memoizedVisitorId) return memoizedVisitorId;

  const storage = acquireStorage();
  if (storage) {
    const stored = readStoredVisitorId(storage);
    if (stored) {
      memoizedVisitorId = stored;
      return stored;
    }
  }

  const nextId = createRandomVisitorId();
  memoizedVisitorId = nextId;
  if (storage) writeStoredVisitorId(storage, nextId);
  return nextId;
}

export function configureVisitorIdentityForTests(
  config: VisitorIdentityTestConfig | null,
): void {
  testConfig = config;
  memoizedVisitorId = null;
}

export function resetVisitorIdentityMemoForTests(): void {
  memoizedVisitorId = null;
}
