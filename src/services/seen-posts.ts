import { AppState, type AppStateStatus } from "react-native";
import * as Sentry from "@sentry/react-native";
import { api } from "@/src/api/client";
import { walletService } from "@/src/services/wallet-service";
import { buildSimpleSignedPayload } from "@/src/api/signing/simple-sign";

export type SeenReason = "dwell" | "glance" | "open" | "vote" | "reply";

type SeenEntry = {
  id: string;
  reason: SeenReason;
  title?: string;
};

type SeenPostsResponse = {
  ok: boolean;
  ingested: number;
};

// The endpoint accepts up to 100 post IDs per call — batch aggressively
// instead of sending near-per-post requests. Entries also flush immediately
// when the buffer fills and whenever the app goes to background.
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 2;

let buffer: SeenEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let initialized = false;

function summarizeReasons(entries: SeenEntry[]): Partial<Record<SeenReason, number>> {
  return entries.reduce<Partial<Record<SeenReason, number>>>((summary, entry) => {
    summary[entry.reason] = (summary[entry.reason] ?? 0) + 1;
    return summary;
  }, {});
}

function normalizePostId(id: string): string {
  return id.trim().toLowerCase();
}

export function markSeen(postId: string, reason: SeenReason, title?: string): void {
  const normalized = normalizePostId(postId);
  if (!normalized) return;

  const normalizedTitle = title?.trim();

  if (__DEV__) {
    console.log("[SeenPosts] marked", {
      id: normalized,
      reason,
      title: normalizedTitle || "(untitled)",
    });
  }

  buffer.push({ id: normalized, reason, title: normalizedTitle });

  if (buffer.length >= MAX_BATCH_SIZE) {
    // Full batch ready — flush now instead of waiting for the timer.
    flushSeenBuffer();
    return;
  }

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

  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      // Every retry needs a fresh nonce. A previous request may have reached
      // the node even when its response was lost; replaying that body produces
      // the production `nonce_replayed` failures tracked in Sentry.
      const signed = buildSimpleSignedPayload(
        wallet,
        `seen_posts:${address}:{timestamp}:{nonce}`,
      );
      const payload = {
        address,
        posts: batch.map((entry) => ({ id: entry.id, reason: entry.reason })),
        ...signed,
      };
      const response = await api.post<SeenPostsResponse>("/seen_posts", payload);
      Sentry.addBreadcrumb({
        category: "seen-posts",
        message: `Flushed ${batch.length} seen post entries`,
        level: "info",
        data: {
          batchSize: batch.length,
          ingested: response.ingested,
          reasons: summarizeReasons(batch),
        },
      });
      return;
    } catch (error: any) {
      retries++;
      const status = error?.response?.status;
      const retryable =
        !error?.response || status === 408 || status === 429 || status >= 500;
      if (!retryable || retries > MAX_RETRIES) {
        Sentry.addBreadcrumb({
          category: "seen-posts",
          message: `Flush failed after ${MAX_RETRIES} retries, dropping ${batch.length} entries`,
          level: "warning",
          data: { batchSize: batch.length, error: error?.message },
        });
        Sentry.captureException(error, {
          tags: { feature: "seen-posts", operation: "flush" },
          extra: { batchSize: batch.length, retries: retries - 1, status },
        });
        return;
      }
    }
  }
}

function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (buffer.length === 0) {
      stopFlushTimer();
      return;
    }
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
    if (buffer.length > 0) {
      Sentry.addBreadcrumb({
        category: "seen-posts",
        message: `Flushing seen posts on app ${nextState}`,
        level: "info",
        data: {
          bufferedEntries: buffer.length,
          reasons: summarizeReasons(buffer),
        },
      });
    }
    flushSeenBuffer();
  }
}

export function initSeenPosts(): void {
  if (initialized) return;
  initialized = true;

  Sentry.addBreadcrumb({
    category: "seen-posts",
    message: "Initialized seen posts tracking",
    level: "info",
  });

  appStateSubscription = AppState.addEventListener("change", handleAppStateChange);
}

export function teardownSeenPosts(): void {
  flushSeenBuffer();
  stopFlushTimer();
  appStateSubscription?.remove();
  appStateSubscription = null;
  initialized = false;
}

export function resetSeenPosts(): void {
  buffer = [];
}
