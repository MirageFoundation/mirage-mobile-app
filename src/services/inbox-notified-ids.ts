import { storage } from "@/src/stores/mmkv-storage";

const NOTIFIED_IDS_KEY = "inbox-notified-ids";
const MAX_NOTIFIED_IDS = 500;

export function getInboxNotifiedIds(): Set<string> {
  const raw = storage.getString(NOTIFIED_IDS_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveInboxNotifiedIds(ids: Set<string>): void {
  const arr = Array.from(ids);
  const trimmed = arr.length > MAX_NOTIFIED_IDS
    ? arr.slice(arr.length - MAX_NOTIFIED_IDS)
    : arr;
  storage.set(NOTIFIED_IDS_KEY, JSON.stringify(trimmed));
}

export function markRepliesAsNotified(replyIds: string[]): void {
  if (replyIds.length === 0) return;
  const existing = getInboxNotifiedIds();
  for (const id of replyIds) {
    existing.add(id);
  }
  saveInboxNotifiedIds(existing);
}
