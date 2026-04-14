import { AppState, type AppStateStatus } from "react-native";
import * as Sentry from "@sentry/react-native";
import { api } from "@/src/api/client";
import { walletService } from "@/src/services/wallet-service";
import { buildSimpleSignedPayload } from "@/src/api/write/signing/simple-sign";
import { storage } from "@/src/stores/mmkv-storage";

export type SeenReason = "dwell" | "glance" | "open" | "vote" | "reply";

type SeenEntry = {
  id: string;
  reason: SeenReason;
};

type SeenPostsResponse = {
  ok: boolean;
  ingested: number;
};

const FLUSH_INTERVAL_MS = 3_000;
const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 2;
const DEDUP_CAP = 2_000;
const DEDUP_STORAGE_KEY = "seen_posts_dedup_set";

let buffer: SeenEntry[] = [];
let dedupSet: Set<string> = new Set();
let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let initialized = false;

function loadDedupSet(): void {
  try {
    const stored = storage.getString(DEDUP_STORAGE_KEY);
    if (stored) {
      const ids: string[] = JSON.parse(stored);
      dedupSet = new Set(ids.slice(0, DEDUP_CAP));
    }
  } catch {
    dedupSet = new Set();
  }
}

function saveDedupSet(): void {
  try {
    const ids = Array.from(dedupSet).slice(0, DEDUP_CAP);
    storage.set(DEDUP_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

function normalizePostId(id: string): string {
  return id.trim().toLowerCase();
}

export function markSeen(postId: string, reason: SeenReason): void {
  const normalized = normalizePostId(postId);
  if (!normalized) return;

  if (dedupSet.has(normalized)) return;

  if (dedupSet.size >= DEDUP_CAP) {
    dedupSet.clear();
    saveDedupSet();
  }

  dedupSet.add(normalized);
  buffer.push({ id: normalized, reason });

  if (!flushTimer) {
    startFlushTimer();
  }
}

export async function flushSeenBuffer(): Promise<void> {
  if (buffer.length === 0) return;

  const wallet = await walletService.getWallet();
  if (!wallet) {
    buffer = [];
    return;
  }

  const address = wallet.address.toLowerCase();

  const batch = buffer.splice(0, MAX_BATCH_SIZE);

  const signed = buildSimpleSignedPayload(
    wallet,
    `seen_posts:${address}:{timestamp}:{nonce}`,
  );

  const payload = {
    address,
    posts: batch.map((entry) => ({ id: entry.id, reason: entry.reason })),
    ...signed,
  };

  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      await api.post<SeenPostsResponse>("/seen_posts", payload);
      saveDedupSet();
      return;
    } catch (error: any) {
      retries++;
      if (retries > MAX_RETRIES) {
        Sentry.addBreadcrumb({
          category: "seen-posts",
          message: `Flush failed after ${MAX_RETRIES} retries, dropping ${batch.length} entries`,
          level: "warning",
          data: { batchSize: batch.length, error: error?.message },
        });
        Sentry.captureException(error, {
          tags: { feature: "seen-posts", operation: "flush" },
          extra: { batchSize: batch.length, retries: MAX_RETRIES },
        });
        saveDedupSet();
        return;
      }
    }
  }
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushSeenBuffer();
  }, FLUSH_INTERVAL_MS);
}

function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === "background" || nextState === "inactive") {
    flushSeenBuffer();
  }
}

export function initSeenPosts(): void {
  if (initialized) return;
  initialized = true;

  loadDedupSet();

  Sentry.addBreadcrumb({
    category: "seen-posts",
    message: `Initialized with ${dedupSet.size} dedup entries`,
    level: "info",
  });

  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

  startFlushTimer();
}

export function teardownSeenPosts(): void {
  stopFlushTimer();
  flushSeenBuffer();
  appStateSubscription?.remove();
  appStateSubscription = null;
  initialized = false;
}

export function resetSeenPosts(): void {
  buffer = [];
  dedupSet.clear();
  saveDedupSet();
}
