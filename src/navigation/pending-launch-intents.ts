import { storage } from "@/src/stores/mmkv-storage";

const PENDING_SHARE_INTENT_KEY = "pending-share-intent";
const PENDING_SHARE_INTENT_TTL_MS = 5 * 60_000;

export type PendingShareIntentFile = {
  path?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  size?: number | null;
};

export type PendingShareIntent = {
  type?: string | null;
  text?: string | null;
  webUrl?: string | null;
  files?: PendingShareIntentFile[];
  launchPath?: string | null;
  source: string;
  receivedAt: number;
};

type ShareIntentLike = {
  type?: unknown;
  text?: unknown;
  webUrl?: unknown;
  files?: unknown;
};

type ShareIntentKeyLike = {
  webUrl?: string | null;
  text?: string | null;
  files?: { path?: string | null }[] | null;
};

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeFiles(value: unknown): PendingShareIntentFile[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((file): PendingShareIntentFile | null => {
      if (!file || typeof file !== "object") return null;
      const record = file as Record<string, unknown>;
      const path = toOptionalString(record.path);
      const mimeType = toOptionalString(record.mimeType);
      const fileName = toOptionalString(record.fileName);
      const size =
        typeof record.size === "number" && Number.isFinite(record.size)
          ? record.size
          : null;

      if (!path && !mimeType && !fileName) return null;
      return { path, mimeType, fileName, size };
    })
    .filter((file): file is PendingShareIntentFile => !!file);
}

export function getPendingShareIntentKey(intent: ShareIntentKeyLike): string | null {
  return intent.webUrl ?? intent.text ?? intent.files?.[0]?.path ?? null;
}

export function persistPendingShareIntent(
  intent: ShareIntentLike | null | undefined,
  source: string,
  launchPath?: string | null,
): PendingShareIntent | null {
  if (!intent || typeof intent !== "object") return null;

  const pending: PendingShareIntent = {
    type: toOptionalString(intent.type),
    text: toOptionalString(intent.text),
    webUrl: toOptionalString(intent.webUrl),
    files: normalizeFiles(intent.files),
    launchPath: launchPath ?? null,
    source,
    receivedAt: Date.now(),
  };

  if (!getPendingShareIntentKey(pending)) return null;

  storage.set(PENDING_SHARE_INTENT_KEY, JSON.stringify(pending));
  return pending;
}

export function getPendingShareIntent(): PendingShareIntent | null {
  const raw = storage.getString(PENDING_SHARE_INTENT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingShareIntent;
    if (!parsed || typeof parsed !== "object") {
      storage.remove(PENDING_SHARE_INTENT_KEY);
      return null;
    }

    if (Date.now() - parsed.receivedAt > PENDING_SHARE_INTENT_TTL_MS) {
      storage.remove(PENDING_SHARE_INTENT_KEY);
      return null;
    }

    if (!getPendingShareIntentKey(parsed)) {
      storage.remove(PENDING_SHARE_INTENT_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage.remove(PENDING_SHARE_INTENT_KEY);
    return null;
  }
}

export function clearPendingShareIntent(expectedKey?: string | null): void {
  if (expectedKey) {
    const pending = getPendingShareIntent();
    if (pending && getPendingShareIntentKey(pending) !== expectedKey) return;
  }

  storage.remove(PENDING_SHARE_INTENT_KEY);
}
