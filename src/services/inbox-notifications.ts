import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import type { Href } from "expo-router";
import { AppState, Platform } from "react-native";
import { navigateBypass, pushBypass, replaceBypass } from "@/src/navigation/guarded-router";
import type { InfiniteData } from "@tanstack/react-query";

import * as Sentry from "@sentry/react-native";
import * as Network from "expo-network";
import { isAxiosError } from "axios";
import { api } from "@/src/api/client";
import { seedFocusedCommentFromInbox } from "@/src/api/cache";
import { queryKeys } from "@/src/api/read/query-keys";
import type { InboxResponse } from "@/src/api/types";
import { queryClient } from "@/src/providers/query-provider";
import { storage } from "@/src/stores/mmkv-storage";
import { useAuthStore } from "@/src/stores/auth-store";
import { useInboxStore } from "@/src/stores/inbox-store";
import { isPushEnabled } from "@/src/services/push-notifications";
import {
  getInboxNotifiedIds,
  saveInboxNotifiedIds,
} from "@/src/services/inbox-notified-ids";
import {
  buildPreviewReplyFromNotification,
  getInboxNotificationResponseId,
  getNotificationBody,
  getNotificationData,
  getNotificationDataKeys,
  getNotificationTitle,
  isAndroidShareIntentNotificationData,
  isFallbackInboxNotificationResponseId,
  toOptionalString,
} from "@/src/services/inbox-notification-content";

const TASK_NAME = "INBOX_NOTIFICATION_CHECK";
const LAST_CHECK_KEY = "inbox-last-check-ts";
const SEEDED_KEY = "inbox-notified-seeded";
const SEED_TIMESTAMP_KEY = "inbox-seed-timestamp";
const FETCH_INTERVAL_SECONDS = 15 * 60;
const FOREGROUND_INTERVAL_MS = FETCH_INTERVAL_SECONDS * 1000;
const SIGNAL_THROTTLE_MS = 15_000;
const INBOX_NAVIGATION_READY_TIMEOUT_MS = 3_000;
const INBOX_NAVIGATION_ACTIVE_WATCHDOG_MS = 8_000;
const INBOX_NAVIGATION_ARRIVAL_TIMEOUT_MS = 5_000;
const INBOX_NOTIFICATION_NAVIGATION_ACTIVE_MS = 10_000;
const SHARE_INTENT_NAVIGATION_ACTIVE_MS = 15_000;
const INBOX_NAVIGATION_RETRY_MS = 250;
const INBOX_NAVIGATION_MAX_RETRIES = 2;

type PendingInboxNotificationNavigation = {
  arrivalTimeoutId: ReturnType<typeof setTimeout>;
  retryTimeoutId: ReturnType<typeof setTimeout> | null;
  dispatchedAt: number;
  replyId: string | null;
  rootPostId: string | null;
  areTabsReady: boolean;
  retriesLeft: number;
  markHandled: () => void;
  retryNavigate: () => void;
};

type InboxNotificationArrivalDebugData = {
  hasTargetReply?: boolean;
  hasFetchedTargetReply?: boolean;
  hasPreviewReply?: boolean;
  visibleReplyCount?: number;
  platform?: string;
};

type InboxNotificationNavigationEventLevel = "info" | "warning" | "error";

let isCheckInFlight = false;
let lastSignalCheckAt = 0;
let foregroundInterval: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove(): void } | null = null;
let unsubscribeInboxSignals: (() => void) | null = null;
let notificationResponseSubscription: Notifications.Subscription | null = null;
let deferredInitSubscription: { remove(): void } | null = null;
let isInboxNotificationsInitialized = false;
let isInitializingInboxNotifications = false;
let lastInboxNotificationNavigationAt = 0;
let inboxNotificationNavigationInFlight = false;
let lastShareIntentNavigationAt = 0;
const pendingInboxNotificationNavigations = new Map<
  string,
  PendingInboxNotificationNavigation
>();

let _rootLayoutReadyResolve: (() => void) | null = null;
let _rootLayoutReadyPromise: Promise<void> = new Promise<void>((resolve) => {
  _rootLayoutReadyResolve = resolve;
});
let _isRootLayoutReady = false;

let _tabsReadyResolve: (() => void) | null = null;
let _tabsReadyPromise: Promise<void> = new Promise<void>((resolve) => {
  _tabsReadyResolve = resolve;
});
let _areTabsReady = false;

export function signalRootLayoutReady(): void {
  if (_isRootLayoutReady) return;
  _isRootLayoutReady = true;
  Sentry.addBreadcrumb({
    category: "notifications",
    message: "Root layout is ready for notification navigation",
    level: "info",
  });
  _rootLayoutReadyResolve?.();
}

export function signalRootLayoutUnmounted(): void {
  if (!_isRootLayoutReady) return;
  _isRootLayoutReady = false;
  _rootLayoutReadyPromise = new Promise<void>((resolve) => {
    _rootLayoutReadyResolve = resolve;
  });
}

export function signalTabsReady(): void {
  if (_areTabsReady) return;
  _areTabsReady = true;
  Sentry.addBreadcrumb({
    category: "notifications",
    message: "Tabs navigator is ready for notification navigation",
    level: "info",
  });
  _tabsReadyResolve?.();
}

export function isInboxNotificationNavigationActive(): boolean {
  // Explicit in-flight flag; the timestamp acts only as a bounded safety net
  // in case a flow dies without reaching its completion handler.
  return (
    inboxNotificationNavigationInFlight &&
    Date.now() - lastInboxNotificationNavigationAt < INBOX_NOTIFICATION_NAVIGATION_ACTIVE_MS
  );
}

function markInboxNotificationNavigationActive(): void {
  inboxNotificationNavigationInFlight = true;
  lastInboxNotificationNavigationAt = Date.now();
  useInboxStore.getState().markNotificationNavigationActive();
}

function clearInboxNotificationNavigationActive(): void {
  inboxNotificationNavigationInFlight = false;
}

function getNotificationResponseAgeMs(
  response: Notifications.NotificationResponse,
): number | null {
  const notificationDate = response.notification?.date;
  if (typeof notificationDate !== "number" || !Number.isFinite(notificationDate)) {
    return null;
  }

  const timestampMs = notificationDate < 1e12 ? notificationDate * 1000 : notificationDate;
  return Date.now() - timestampMs;
}

export function markShareIntentNavigationActive(reason = "share-intent"): void {
  lastShareIntentNavigationAt = Date.now();
  Sentry.addBreadcrumb({
    category: "share-intent",
    message: "Share intent navigation marked active",
    level: "info",
    data: { reason },
  });
}

export function isShareIntentNavigationActive(): boolean {
  return Date.now() - lastShareIntentNavigationAt < SHARE_INTENT_NAVIGATION_ACTIVE_MS;
}

function getNavigationReadinessDebugData(): Record<string, unknown> {
  return {
    isRootLayoutReady: _isRootLayoutReady,
    areTabsReady: _areTabsReady,
    appState: AppState.currentState,
    hasWallet: !!useAuthStore.getState().walletAddress,
    isInboxNotificationsInitialized,
    isInitializingInboxNotifications,
    hasNotificationResponseSubscription: !!notificationResponseSubscription,
    pendingInboxNotificationNavigationCount: pendingInboxNotificationNavigations.size,
    isShareIntentNavigationActive: isShareIntentNavigationActive(),
  };
}

function captureInboxNotificationNavigationEvent(
  message: string,
  level: InboxNotificationNavigationEventLevel,
  operation: string,
  extra: Record<string, unknown> = {},
): void {
  const data = {
    operation,
    ...extra,
    ...getNavigationReadinessDebugData(),
  };
  if (level === "info") {
    Sentry.addBreadcrumb({
      category: "inbox-notifications",
      message,
      level,
      data,
    });
    return;
  }

  Sentry.captureMessage(message, {
    level,
    tags: {
      feature: "inbox-notifications",
      operation,
    },
    extra: data,
  });
}

function getNotificationResponseDebugData(
  response: Notifications.NotificationResponse,
  notificationData: Record<string, unknown>,
  source: "live-listener" | "last-response" | "wallet-deferred",
  notificationId?: string,
  notificationAgeMs?: number | null,
): Record<string, unknown> {
  return {
    notificationId,
    source,
    actionIdentifier: response.actionIdentifier,
    appState: AppState.currentState,
    notificationDate: response.notification?.date,
    notificationAgeMs,
    requestIdentifier: response.notification?.request?.identifier,
    dataKeys: getNotificationDataKeys(notificationData),
    hasNotificationType: !!notificationData.notificationType,
    notificationType: toOptionalString(notificationData.notificationType),
    hasNotificationKind: !!toOptionalString(notificationData.type),
    notificationKind: toOptionalString(notificationData.type),
    hasReplyId: !!toOptionalString(notificationData.replyId),
    hasRootPostId: !!toOptionalString(notificationData.rootPostId),
    hasInboxReply: !!notificationData.inboxReply,
  };
}

function hasInboxNotificationPayload(
  notificationData: Record<string, unknown>,
): boolean {
  return !!(
    toOptionalString(notificationData.notificationType) === "inbox" ||
    toOptionalString(notificationData.notificationId) ||
    toOptionalString(notificationData.type) ||
    toOptionalString(notificationData.replyId) ||
    toOptionalString(notificationData.rootPostId) ||
    notificationData.inboxReply
  );
}

function clearPendingInboxNotificationNavigation(notificationId: string): void {
  const pending = pendingInboxNotificationNavigations.get(notificationId);
  if (!pending) return;
  clearTimeout(pending.arrivalTimeoutId);
  if (pending.retryTimeoutId) clearTimeout(pending.retryTimeoutId);
  pendingInboxNotificationNavigations.delete(notificationId);
}

function watchInboxNotificationArrival(
  notificationId: string,
  options: {
    replyId: string | null;
    rootPostId: string | null;
    areTabsReady: boolean;
    markHandled: () => void;
    retryNavigate: () => void;
  },
): void {
  clearPendingInboxNotificationNavigation(notificationId);
  const dispatchedAt = Date.now();
  const arrivalTimeoutId = setTimeout(() => {
    const pending = pendingInboxNotificationNavigations.get(notificationId);
    if (!pending) return;
    pendingInboxNotificationNavigations.delete(notificationId);
    Sentry.captureMessage(
      "Inbox notification navigation dispatched but inbox did not confirm arrival",
      {
        level: "warning",
        tags: {
          feature: "inbox-notifications",
          operation: "notification-arrival-watchdog",
        },
        extra: {
          notificationId,
          elapsedMs: Date.now() - pending.dispatchedAt,
          hasReplyId: !!pending.replyId,
          hasRootPostId: !!pending.rootPostId,
          areTabsReady: pending.areTabsReady,
          retriesLeft: pending.retriesLeft,
          ...getNavigationReadinessDebugData(),
        },
      },
    );
  }, INBOX_NAVIGATION_ARRIVAL_TIMEOUT_MS);

  const scheduleRetry = () => {
    const pending = pendingInboxNotificationNavigations.get(notificationId);
    if (!pending) return;
    if (pending.retriesLeft <= 0) return;
    pending.retryTimeoutId = setTimeout(() => {
      const stillPending = pendingInboxNotificationNavigations.get(notificationId);
      if (!stillPending) return;
      stillPending.retriesLeft -= 1;
      Sentry.captureMessage(
        "Retrying inbox notification navigation after no arrival",
        {
          level: "warning",
          tags: {
            feature: "inbox-notifications",
            operation: "notification-navigate-retry",
          },
          extra: {
            notificationId,
            elapsedMs: Date.now() - stillPending.dispatchedAt,
            retriesLeft: stillPending.retriesLeft,
            ...getNavigationReadinessDebugData(),
          },
        },
      );
      try {
        stillPending.retryNavigate();
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: "inbox-notifications", action: "notification_navigate_retry" },
        });
      }
      scheduleRetry();
    }, INBOX_NAVIGATION_RETRY_MS);
  };

  pendingInboxNotificationNavigations.set(notificationId, {
    arrivalTimeoutId,
    retryTimeoutId: null,
    dispatchedAt,
    replyId: options.replyId,
    rootPostId: options.rootPostId,
    areTabsReady: options.areTabsReady,
    retriesLeft: INBOX_NAVIGATION_MAX_RETRIES,
    markHandled: options.markHandled,
    retryNavigate: options.retryNavigate,
  });
  scheduleRetry();
}

export function confirmInboxNotificationNavigation(
  notificationId: string | null | undefined,
  debugData: InboxNotificationArrivalDebugData = {},
): void {
  if (!notificationId) return;
  const pending = pendingInboxNotificationNavigations.get(notificationId);
  if (!pending) {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: "Inbox notification navigation arrival had no pending dispatch",
      level: "info",
      data: { notificationId, ...debugData, ...getNavigationReadinessDebugData() },
    });
    return;
  }

  clearPendingInboxNotificationNavigation(notificationId);
  Sentry.addBreadcrumb({
    category: "navigation",
    message: "Inbox notification navigation arrived",
    level: "info",
    data: {
      notificationId,
      elapsedMs: Date.now() - pending.dispatchedAt,
      hasReplyId: !!pending.replyId,
      hasRootPostId: !!pending.rootPostId,
      areTabsReady: pending.areTabsReady,
      retriesLeft: pending.retriesLeft,
      ...debugData,
      ...getNavigationReadinessDebugData(),
    },
  });
  try {
    pending.markHandled();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "inbox-notifications", action: "mark_handled" },
    });
  }
}

export function signalTabsUnmounted(): void {
  if (!_areTabsReady) return;
  _areTabsReady = false;
  Sentry.addBreadcrumb({
    category: "notifications",
    message: "Tabs navigator unmounted for notification navigation",
    level: "info",
    data: getNavigationReadinessDebugData(),
  });
  _tabsReadyPromise = new Promise<void>((resolve) => {
    _tabsReadyResolve = resolve;
  });
}

async function waitForTabsReady(timeoutMs = 5000): Promise<void> {
  const timeoutId = setTimeout(() => {
    Sentry.captureMessage(
      "Inbox notification navigation delayed until tabs ready",
      {
        level: "warning",
        tags: {
          feature: "inbox-notifications",
          operation: "wait-tabs-ready",
        },
        extra: { timeoutMs, ...getNavigationReadinessDebugData() },
      },
    );
  }, timeoutMs);

  await Promise.all([_rootLayoutReadyPromise, _tabsReadyPromise]);
  clearTimeout(timeoutId);
  Sentry.addBreadcrumb({
    category: "notifications",
    message: "Navigation tree ready before inbox notification navigation",
    level: "info",
  });
}

function isNotificationAccessDeferredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("getregistrationinfoasync") ||
    message.includes("keychain access failed") ||
    message.includes("user interaction is not allowed")
  );
}

function scheduleInitInboxNotificationsOnForeground(): void {
  if (deferredInitSubscription) {
    return;
  }

  deferredInitSubscription = AppState.addEventListener("change", (nextState) => {
    if (nextState !== "active") {
      return;
    }

    deferredInitSubscription?.remove();
    deferredInitSubscription = null;
    void initInboxNotifications();
  });
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log("[InboxNotifications] handleNotification called for:", notification.request.identifier);
    const isInboxActive = useInboxStore.getState().isInboxActive;
    return {
      shouldShowBanner: !isInboxActive,
      shouldShowList: !isInboxActive,
      shouldPlaySound: !isInboxActive,
      shouldSetBadge: false,
    };
  },
});

export function getNotifiedIds(): Set<string> {
  return getInboxNotifiedIds();
}

export function getSeedTimestamp(): number {
  const raw = storage.getString(SEED_TIMESTAMP_KEY);
  if (!raw) return 0;
  return parseInt(raw, 10) || 0;
}

function saveNotifiedIds(ids: Set<string>): void {
  saveInboxNotifiedIds(ids);
}

function seedInboxCache(walletAddress: string, inbox: InboxResponse): void {
  const page = inbox.page || 1;
  queryClient.setQueryData<InfiniteData<InboxResponse>>(
    queryKeys.inboxInfinite(walletAddress),
    (current) => {
      if (!current) {
        return { pages: [inbox], pageParams: [page] };
      }
      const pages = [...current.pages];
      pages[0] = inbox;
      const pageParams = current.pageParams.length
        ? current.pageParams
        : [page];
      return { ...current, pages, pageParams };
    },
  );
  queryClient.setQueryData(queryKeys.inbox(walletAddress, page), inbox);
}

async function fetchAndSeedInboxCache(
  walletAddress: string,
  limit = 25,
): Promise<InboxResponse> {
  const inbox = await api.get<InboxResponse>("/get_inbox", {
    address: walletAddress,
    limit,
  });
  seedInboxCache(walletAddress, inbox);
  return inbox;
}

async function seedExistingReplies(walletAddress: string): Promise<void> {
  try {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      console.log("[InboxNotifications] Offline, skipping seed");
      return;
    }

    const inbox = await api.get<InboxResponse>("/get_inbox", {
      address: walletAddress,
      limit: 500,
    });

    if (inbox.replies && inbox.replies.length > 0) {
      const ids = new Set(inbox.replies.map((r) => r.reply_id));
      saveNotifiedIds(ids);
    }

    storage.set(SEEDED_KEY, "true");
    storage.set(SEED_TIMESTAMP_KEY, Math.floor(Date.now() / 1000).toString());
    console.log("[InboxNotifications] Seeded existing replies, won't spam on first run");
  } catch (error) {
    if (isAxiosError(error) && error.message === "Network Error") {
      console.log("[InboxNotifications] Seed skipped: device is offline");
      return;
    }
    console.error("[InboxNotifications] Seed failed:", error);
    Sentry.addBreadcrumb({
      category: "notifications",
      message: "Inbox seed failed",
      level: "error",
    });
  }
}

async function performInboxCheck(
  trigger: "background" | "foreground" | "manual" | "signal"
): Promise<BackgroundFetch.BackgroundFetchResult> {

  try {
    const walletAddress = useAuthStore.getState().walletAddress;
    console.log("[InboxNotifications] walletAddress:", walletAddress);
    if (!walletAddress) {
      console.log("[InboxNotifications] No wallet, skipping");
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const isSeeded = storage.getString(SEEDED_KEY);
    console.log("[InboxNotifications] isSeeded:", isSeeded);
    if (!isSeeded) {
      await seedExistingReplies(walletAddress);
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const { status } = await Notifications.getPermissionsAsync();
    console.log("[InboxNotifications] Permission status:", status);
    if (status !== "granted") {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      console.log("[InboxNotifications] Offline, skipping inbox check");
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    if (trigger === "foreground") {
      await Notifications.dismissAllNotificationsAsync();
    }

    if (trigger !== "background") {
      useInboxStore.setState({ _suppressUntil: Date.now() + 30_000 });
    }

    const inbox = await fetchAndSeedInboxCache(walletAddress, 50);

    if (useAuthStore.getState().walletAddress !== walletAddress) {
      console.log("[InboxNotifications] Wallet changed during check, skipping notification");
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Wallet changed during inbox check; skipped notification scheduling",
        level: "info",
        data: { trigger },
      });
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    console.log("[InboxNotifications] Fetched replies:", inbox.replies?.length ?? 0);

    if (!inbox.replies || inbox.replies.length === 0) {
      storage.set(LAST_CHECK_KEY, Date.now().toString());
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const notifiedIds = getNotifiedIds();
    const lastViewedAt = useInboxStore.getState().lastViewedAt;
    console.log("[InboxNotifications] Already notified IDs count:", notifiedIds.size);
    const newReplies = inbox.replies.filter((r) => !notifiedIds.has(r.reply_id));
    console.log("[InboxNotifications] New replies to notify:", newReplies.length);

    if (newReplies.length === 0) {
      storage.set(LAST_CHECK_KEY, Date.now().toString());
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const unreadReplies: InboxResponse["replies"][number][] = [];
    for (const reply of newReplies) {
      const replyTimestamp = Math.max(0, Number(reply.reply_timestamp) || 0);
      if (lastViewedAt > 0 && replyTimestamp <= lastViewedAt) {
        notifiedIds.add(reply.reply_id);
        continue;
      }
      unreadReplies.push(reply);
    }

    if (unreadReplies.length === 0) {
      saveNotifiedIds(notifiedIds);
      storage.set(LAST_CHECK_KEY, Date.now().toString());
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    if (trigger !== "background") {
      useInboxStore.setState({
        unreadCount: unreadReplies.length,
        hasUnread: true,
        _suppressUntil: Date.now() + 30_000,
      });
    }

    for (const reply of unreadReplies) {
      if (useAuthStore.getState().walletAddress !== walletAddress) {
        console.log("[InboxNotifications] Wallet changed before scheduling, stopping notification loop");
        Sentry.addBreadcrumb({
          category: "inbox-notifications",
          message: "Wallet changed before local notification scheduling",
          level: "info",
          data: { trigger, unreadCount: unreadReplies.length },
        });
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      notifiedIds.add(reply.reply_id);
      saveNotifiedIds(notifiedIds);

      if (!isPushEnabled()) {
        console.log("[InboxNotifications] Scheduling notification for:", reply.reply_id);
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: getNotificationTitle(reply),
            body: getNotificationBody(reply),
            data: {
              notificationType: "inbox",
              notificationId: `inbox-reply:${reply.reply_id}`,
              rootPostId: reply.root_post_id,
              replyId: reply.reply_id,
              type: reply.type,
              inboxReply: reply,
            },
            ...(Platform.OS === "android" && {
              categoryIdentifier: "inbox",
            }),
          },
          trigger: null,
        });
        console.log("[InboxNotifications] Scheduled notification id:", id);
      }
    }

    storage.set(LAST_CHECK_KEY, Date.now().toString());

    return unreadReplies.length > 0
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    if (isNotificationAccessDeferredError(error)) {
      console.warn("[InboxNotifications] Notification permission access deferred until foreground");
      if (AppState.currentState !== "active") {
        scheduleInitInboxNotificationsOnForeground();
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    if (isAxiosError(error) && error.message === "Network Error") {
      console.log("[InboxNotifications] Check skipped: device is offline");
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    console.error("[InboxNotifications] Check failed:", error);
    Sentry.captureException(error, {
      tags: { action: "inbox_check" },
    });
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

async function runInboxCheck(
  trigger: "background" | "foreground" | "manual" | "signal"
): Promise<BackgroundFetch.BackgroundFetchResult> {
  if (isCheckInFlight) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  if (trigger === "signal") {
    const now = Date.now();
    if (now - lastSignalCheckAt < SIGNAL_THROTTLE_MS) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    lastSignalCheckAt = now;
  }

  isCheckInFlight = true;
  try {
    return await performInboxCheck(trigger);
  } finally {
    isCheckInFlight = false;
  }
}

function triggerForegroundCheck(): void {
  runInboxCheck("foreground").catch((error) => {
    console.error("[InboxNotifications] Foreground check failed:", error);
    Sentry.captureException(error, {
      tags: { feature: "inbox-notifications", operation: "foreground-check" },
    });
  });
}

function startForegroundPolling(): void {
  if (foregroundInterval) return;
  foregroundInterval = setInterval(() => {
    triggerForegroundCheck();
  }, FOREGROUND_INTERVAL_MS);
}

function stopForegroundPolling(): void {
  if (!foregroundInterval) return;
  clearInterval(foregroundInterval);
  foregroundInterval = null;
}

function subscribeAppState(): void {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active") {
      triggerForegroundCheck();
      startForegroundPolling();
    } else {
      stopForegroundPolling();
    }
  });

  if (AppState.currentState === "active") {
    triggerForegroundCheck();
    startForegroundPolling();
  }
}

const HANDLED_NOTIFICATION_IDS_KEY = "inbox-handled-notification-ids";
const handledNotificationIdsInFlight = new Set<string>();
const deferredNotificationResponseRetries = new Map<string, number>();
const deferredNotificationResponses = new Map<string, Notifications.NotificationResponse>();
const deferredNotificationResponseReceivedAt = new Map<string, number>();
let unsubscribeDeferredNotificationWalletWatcher: (() => void) | null = null;
const DEFERRED_NOTIFICATION_RESPONSE_RETRY_MS = 500;
const DEFERRED_NOTIFICATION_RESPONSE_MAX_AGE_MS = 5 * 60_000;

function getHandledNotificationIds(): Set<string> {
  const raw = storage.getString(HANDLED_NOTIFICATION_IDS_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveHandledNotificationIds(ids: Set<string>): void {
  const arr = Array.from(ids);
  const trimmed = arr.length > 50 ? arr.slice(arr.length - 50) : arr;
  storage.set(HANDLED_NOTIFICATION_IDS_KEY, JSON.stringify(trimmed));
}

function clearDeferredNotificationResponse(notificationId: string): void {
  deferredNotificationResponseRetries.delete(notificationId);
  deferredNotificationResponses.delete(notificationId);
  deferredNotificationResponseReceivedAt.delete(notificationId);
}

function flushDeferredNotificationResponses(reason: string): void {
  if (!useAuthStore.getState().walletAddress) return;
  for (const [notificationId, response] of Array.from(deferredNotificationResponses.entries())) {
    clearDeferredNotificationResponse(notificationId);
    Sentry.addBreadcrumb({
      category: "inbox-notifications",
      message: "Inbox notification response resumed after wallet ready",
      level: "info",
      data: {
        notificationId,
        reason,
        ...getNavigationReadinessDebugData(),
      },
    });
    handleNotificationResponse(response, "wallet-deferred");
  }
}

function ensureDeferredNotificationWalletWatcher(): void {
  if (unsubscribeDeferredNotificationWalletWatcher) return;
  unsubscribeDeferredNotificationWalletWatcher = useAuthStore.subscribe((state) => {
    if (!state.walletAddress) return;
    flushDeferredNotificationResponses("wallet-store-ready");
  });
}

function deferNotificationResponseUntilWallet(
  response: Notifications.NotificationResponse,
  notificationId: string,
): void {
  ensureDeferredNotificationWalletWatcher();
  deferredNotificationResponses.set(notificationId, response);
  if (!deferredNotificationResponseReceivedAt.has(notificationId)) {
    deferredNotificationResponseReceivedAt.set(notificationId, Date.now());
  }
  const attempt = (deferredNotificationResponseRetries.get(notificationId) ?? 0) + 1;
  deferredNotificationResponseRetries.set(notificationId, attempt);
  const receivedAt = deferredNotificationResponseReceivedAt.get(notificationId) ?? Date.now();
  const ageMs = Date.now() - receivedAt;

  Sentry.addBreadcrumb({
    category: "inbox-notifications",
    message: "Deferring notification response until wallet is ready",
    level: "info",
    data: {
      notificationId,
      attempt,
      ageMs,
      ...getNavigationReadinessDebugData(),
    },
  });

  if (ageMs > DEFERRED_NOTIFICATION_RESPONSE_MAX_AGE_MS) {
    clearDeferredNotificationResponse(notificationId);
    Sentry.captureMessage("Inbox notification response expired before wallet ready", {
      level: "warning",
      tags: {
        feature: "inbox-notifications",
        operation: "deferred-notification-response",
      },
      extra: {
        notificationId,
        attempt,
        ageMs,
        ...getNavigationReadinessDebugData(),
      },
    });
    return;
  }

  setTimeout(() => {
    if (!useAuthStore.getState().walletAddress) {
      deferNotificationResponseUntilWallet(response, notificationId);
      return;
    }

    flushDeferredNotificationResponses("retry-timer");
  }, DEFERRED_NOTIFICATION_RESPONSE_RETRY_MS);
}

function handleNotificationResponse(
  response: Notifications.NotificationResponse | null,
  source: "live-listener" | "last-response" | "wallet-deferred" = "live-listener",
): void {
  if (!response) return;
  try {
    const notificationData = getNotificationData(response);
    if (isAndroidShareIntentNotificationData(notificationData)) {
      markShareIntentNavigationActive("android-intent-extra-in-notification-response");
      const debugData = getNotificationResponseDebugData(
        response,
        notificationData,
        source,
      );
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Ignoring Android share intent in notification response handler",
        level: "info",
        data: {
          ...debugData,
          hasSharedText: !!toOptionalString(notificationData["android.intent.extra.TEXT"]),
          ...getNavigationReadinessDebugData(),
        },
      });
      captureInboxNotificationNavigationEvent(
        "Inbox notification response ignored as Android share intent",
        "info",
        "ignored-share-intent",
        {
          ...debugData,
          hasSharedText: !!toOptionalString(notificationData["android.intent.extra.TEXT"]),
        },
      );
      return;
    }
    if (source === "last-response" && isShareIntentNavigationActive()) {
      const debugData = getNotificationResponseDebugData(
        response,
        notificationData,
        source,
      );
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Ignoring stale last notification response during share intent",
        level: "info",
        data: {
          ...debugData,
          ...getNavigationReadinessDebugData(),
        },
      });
      captureInboxNotificationNavigationEvent(
        "Inbox notification response ignored during share intent",
        "info",
        "ignored-stale-share-intent-response",
        debugData,
      );
      void Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
      return;
    }
    const notificationId = getInboxNotificationResponseId(response, notificationData);
    const isFallbackNotificationId = isFallbackInboxNotificationResponseId(notificationId);
    const notificationAgeMs = getNotificationResponseAgeMs(response);
    const responseDebugData = getNotificationResponseDebugData(
      response,
      notificationData,
      source,
      notificationId,
      notificationAgeMs,
    );
    if (isFallbackNotificationId && !hasInboxNotificationPayload(notificationData)) {
      // Android may replay launcher/remote-intent metadata through
      // getLastNotificationResponseAsync() on cold start or resume. If it has
      // no inbox marker and no stable notification id, it is not an actionable
      // inbox notification tap.
      captureInboxNotificationNavigationEvent(
        "Inbox notification response ignored without inbox payload",
        "info",
        "ignored-unidentified-response",
        responseDebugData,
      );
      void Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
      return;
    }
    if (isFallbackNotificationId) {
      captureInboxNotificationNavigationEvent(
        "Inbox notification response arrived without identifiable payload",
        "warning",
        "empty-notification-response",
        {
          ...responseDebugData,
          hasNotification: !!response.notification,
          hasRequestContent: !!response.notification?.request?.content,
          hasTitle: !!response.notification?.request?.content?.title,
          hasBody: !!response.notification?.request?.content?.body,
          triggerType: toOptionalString(
            (response.notification?.request?.trigger as { type?: unknown } | null)?.type,
          ),
        },
      );
    }
    Sentry.addBreadcrumb({
      category: "notifications",
      message: "Inbox notification response received",
      level: "info",
      data: {
        ...responseDebugData,
        ...getNavigationReadinessDebugData(),
      },
    });
    captureInboxNotificationNavigationEvent(
      "Inbox notification response received",
      "info",
      "notification-response-received",
      responseDebugData,
    );
    const handledNotificationIds = getHandledNotificationIds();
    // Fallback ids are not stable across taps (and a constant poisoned id may
    // already be persisted on devices), so never dedupe them against storage.
    const wasPersistedHandled =
      !isFallbackNotificationId && handledNotificationIds.has(notificationId);
    const wasInFlight = handledNotificationIdsInFlight.has(notificationId);
    if (
      wasPersistedHandled ||
      wasInFlight
    ) {
      console.log("[InboxNotifications] Already handled notification:", notificationId);
      Sentry.addBreadcrumb({
        category: "notifications",
        message: "Inbox notification response already handled",
        level: "info",
        data: { notificationId, source, notificationAgeMs, wasPersistedHandled, wasInFlight },
      });
      captureInboxNotificationNavigationEvent(
        "Inbox notification response ignored because it was already handled",
        "warning",
        "duplicate-notification-response",
        {
          ...responseDebugData,
          wasPersistedHandled,
          wasInFlight,
          handledIdsCount: handledNotificationIds.size,
        },
      );
      void Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
      return;
    }
    if (
      isFallbackNotificationId &&
      source === "last-response" &&
      isInboxNotificationNavigationActive()
    ) {
      // Data-less responses no longer share a stable id, so the in-flight set
      // cannot dedupe a cold-start replay of the same tap. If an inbox
      // notification navigation was dispatched moments ago, treat this
      // last-response as that same tap.
      captureInboxNotificationNavigationEvent(
        "Inbox notification last-response ignored during active navigation",
        "info",
        "ignored-fallback-last-response",
        responseDebugData,
      );
      void Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
      return;
    }
    markInboxNotificationNavigationActive();
    if (!useAuthStore.getState().walletAddress) {
      console.log("[InboxNotifications] Deferring notification response until wallet is ready");
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Notification response received before wallet is ready",
        level: "info",
        data: { notificationId, source, ...getNavigationReadinessDebugData() },
      });
      captureInboxNotificationNavigationEvent(
        "Inbox notification navigation deferred because wallet was not ready",
        "info",
        "wallet-not-ready",
        responseDebugData,
      );
      deferNotificationResponseUntilWallet(response, notificationId);
      return;
    }
    deferredNotificationResponseRetries.delete(notificationId);
    handledNotificationIdsInFlight.add(notificationId);
    if (handledNotificationIdsInFlight.size > 50) {
      const oldestId = handledNotificationIdsInFlight.values().next().value;
      if (oldestId) handledNotificationIdsInFlight.delete(oldestId);
    }
    const previewReply = buildPreviewReplyFromNotification(response.notification);
    const replyId =
      previewReply?.reply_id ??
      (typeof notificationData?.replyId === "string"
        ? notificationData.replyId
        : null);
    const rootPostId =
      previewReply?.root_post_id ??
      (typeof notificationData?.rootPostId === "string"
        ? notificationData.rootPostId
        : null);
    const targetType =
      previewReply?.type ??
      (typeof notificationData?.type === "string" ? notificationData.type : "reply");
    const previewReplyHasContent = !!previewReply?.reply_content?.trim();
    const isActionTargetType =
      targetType === "donation" ||
      targetType === "follow" ||
      targetType === "subscription_gift";
    const canOpenReplyDetailImmediately = !!(
      replyId &&
      rootPostId &&
      previewReplyHasContent &&
      !isActionTargetType
    );
    const canOpenPostDetailImmediately = !!(
      rootPostId &&
      !canOpenReplyDetailImmediately &&
      !isActionTargetType
    );
    console.log("[InboxNotifFlow] target resolved", {
      notificationId,
      replyId,
      rootPostId,
      targetType,
      hasPreviewReply: !!previewReply,
      previewReplyHasContent,
      canOpenReplyDetailImmediately,
      canOpenPostDetailImmediately,
      appState: AppState.currentState,
    });
    Sentry.addBreadcrumb({
      category: "notifications",
      message: "Inbox notification target resolved",
      level: "info",
      data: {
        notificationId,
        hasPreviewReply: !!previewReply,
        hasReplyId: !!replyId,
        hasRootPostId: !!rootPostId,
        targetType,
        previewReplyHasContent,
        canOpenReplyDetailImmediately,
        canOpenPostDetailImmediately,
      },
    });
    if (previewReply && replyId && rootPostId && !previewReplyHasContent) {
      Sentry.addBreadcrumb({
        category: "notifications",
        message: "Inbox notification will use inbox tap behavior without highlight",
        level: "info",
        data: {
          notificationId,
          replyId,
          rootPostId,
          targetType,
        },
      });
    }
    if (!replyId && !rootPostId && !previewReply && targetType !== "summary") {
      captureInboxNotificationNavigationEvent(
        "Inbox notification target resolved without reply or root post ids",
        "warning",
        "target-resolution-missing-ids",
        responseDebugData,
      );
    }
    useInboxStore.getState().setNotificationTarget({
      notificationId,
      replyId,
      rootPostId,
      previewReply,
    });
    const prefetchInbox = async () => {
      const address = useAuthStore.getState().walletAddress;
      if (!address) return;
      console.log("[InboxNotifFlow] prefetch inbox start", { notificationId, address });
      await fetchAndSeedInboxCache(address, 25);
      console.log("[InboxNotifFlow] prefetch inbox done", { notificationId });
      Sentry.addBreadcrumb({
        category: "notifications",
        message: "Inbox prefetch before notification navigation succeeded",
        level: "info",
        data: { notificationId },
      });
    };
    const navigateToInbox = async () => {
      markInboxNotificationNavigationActive();
      void prefetchInbox().catch((error) => {
        console.warn("[InboxNotifications] Failed to prefetch inbox before navigation:", error);
        Sentry.addBreadcrumb({
          category: "notifications",
          message: "Inbox prefetch before notification navigation failed",
          level: "warning",
          data: {
            notificationId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        captureInboxNotificationNavigationEvent(
          "Inbox prefetch before notification navigation failed",
          "warning",
          "prefetch-before-navigation",
          {
            notificationId,
            errorName: error instanceof Error ? error.name : null,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        );
      });
      const dispatchNavigate = () => {
        // Re-mark active right before each dispatch so any concurrent
        // initial-route recovery in tab-layout sees the notification flow as
        // still in progress.
        markInboxNotificationNavigationActive();
        console.log("[InboxNotifFlow] inbox nav dispatch", {
          notificationId,
          replyId,
          rootPostId,
          action: canOpenReplyDetailImmediately || canOpenPostDetailImmediately ? "replace" : "navigate",
          openReply: canOpenReplyDetailImmediately || canOpenPostDetailImmediately ? "0" : "1",
        });
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Dispatching inbox route for notification",
          level: "info",
          data: {
            notificationId,
            replyId,
            rootPostId,
            action: canOpenReplyDetailImmediately || canOpenPostDetailImmediately ? "replace" : "navigate",
            openReply: canOpenReplyDetailImmediately || canOpenPostDetailImmediately ? "0" : "1",
            ...getNavigationReadinessDebugData(),
          },
        });
        const inboxHref = (
          `/(tabs)/inbox?fromNotification=${encodeURIComponent(notificationId)}` +
          `${replyId ? `&replyId=${encodeURIComponent(replyId)}` : ""}` +
          `&openReply=${canOpenReplyDetailImmediately || canOpenPostDetailImmediately ? "0" : "1"}`
        ) as Href;
        if (canOpenReplyDetailImmediately || canOpenPostDetailImmediately) {
          replaceBypass(inboxHref);
          return;
        }
        navigateBypass(inboxHref);
      };
      const dispatchReplyDetail = () => {
        console.log("[InboxNotifFlow] detail dispatch check", {
          notificationId,
          replyId,
          rootPostId,
          canOpenReplyDetailImmediately,
          canOpenPostDetailImmediately,
        });
        if (!rootPostId || (!canOpenReplyDetailImmediately && !canOpenPostDetailImmediately)) {
          Sentry.captureMessage("Inbox notification detail push skipped", {
            level: "warning",
            tags: {
              feature: "inbox-notifications",
              operation: "detail-push-skipped",
            },
            extra: {
              notificationId,
              replyId,
              rootPostId,
              targetType,
              canOpenReplyDetailImmediately,
              canOpenPostDetailImmediately,
              ...getNavigationReadinessDebugData(),
            },
          });
          return;
        }
        markInboxNotificationNavigationActive();
        if (canOpenReplyDetailImmediately && replyId && previewReply) {
          seedFocusedCommentFromInbox(
            queryClient,
            previewReply,
            useAuthStore.getState().walletAddress ?? undefined,
          );
        }
        const postDetailHref = (
          canOpenReplyDetailImmediately && replyId
            ? `/post/${encodeURIComponent(rootPostId)}?highlight=${encodeURIComponent(replyId)}&fromNotification=${encodeURIComponent(notificationId)}`
            : `/post/${encodeURIComponent(rootPostId)}?fromNotification=${encodeURIComponent(notificationId)}`
        ) as Href;
        Sentry.addBreadcrumb({
          category: "navigation",
          message: canOpenReplyDetailImmediately
            ? "Opening notification reply detail after inbox"
            : "Opening notification post detail after inbox",
          level: "info",
          data: {
            notificationId,
            replyId,
            rootPostId,
            hasPreviewReply: !!previewReply,
            hasHighlight: canOpenReplyDetailImmediately && !!replyId,
          },
        });
        pushBypass(postDetailHref);
        console.log("[InboxNotifFlow] push -> detail", {
          notificationId,
          replyId,
          rootPostId,
          hasPreviewReply: !!previewReply,
          hasHighlight: canOpenReplyDetailImmediately && !!replyId,
        });
        useInboxStore.getState().clearNotificationTarget(notificationId);
        clearPendingInboxNotificationNavigation(notificationId);
        markHandled();
      };
      const markHandled = () => {
        console.log("[InboxNotifFlow] mark handled", { notificationId });
        if (!isFallbackNotificationId) {
          const ids = getHandledNotificationIds();
          ids.add(notificationId);
          saveHandledNotificationIds(ids);
        }
        handledNotificationIdsInFlight.delete(notificationId);
        clearInboxNotificationNavigationActive();
      };
      await waitForTabsReady(INBOX_NAVIGATION_READY_TIMEOUT_MS);
      const areTabsReadyAtDispatch = _areTabsReady;
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Dispatching inbox notification navigation after tabs became ready",
        level: "info",
        data: {
          notificationId,
          hasReplyId: !!replyId,
          hasRootPostId: !!rootPostId,
          areTabsReady: areTabsReadyAtDispatch,
          ...getNavigationReadinessDebugData(),
        },
      });
      watchInboxNotificationArrival(notificationId, {
        replyId,
        rootPostId,
        areTabsReady: areTabsReadyAtDispatch,
        markHandled,
        retryNavigate: dispatchNavigate,
      });
      try {
        dispatchNavigate();
        if (canOpenReplyDetailImmediately || canOpenPostDetailImmediately) {
          // Push the detail route in the same tick as the inbox replace so no
          // other navigation (share intent, deep link, app-state change) can
          // interleave between the two dispatches.
          Sentry.addBreadcrumb({
            category: "navigation",
            message: canOpenReplyDetailImmediately
              ? "Pushing notification reply detail"
              : "Pushing notification post detail",
            level: "info",
            data: { notificationId, replyId, rootPostId },
          });
          dispatchReplyDetail();
        }
      } catch (error) {
        clearPendingInboxNotificationNavigation(notificationId);
        throw error;
      }
      void Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
    };
    const runNavigateToInbox = () => {
      void navigateToInbox().catch((error) => {
        handledNotificationIdsInFlight.delete(notificationId);
        clearInboxNotificationNavigationActive();
        console.error("[InboxNotifications] Failed to navigate from notification:", error);
        Sentry.captureException(error, {
          tags: { action: "notification_navigate" },
        });
      });
    };
    if (AppState.currentState !== "active") {
      const deferredAt = Date.now();
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Deferring inbox notification navigation until app active",
        level: "info",
        data: { notificationId, source, appState: AppState.currentState },
      });
      let didNavigate = false;
      const navigateOnce = () => {
        if (didNavigate) return;
        didNavigate = true;
        sub.remove();
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Starting deferred inbox notification navigation",
          level: "info",
          data: {
            notificationId,
            source,
            appState: AppState.currentState,
            deferredForMs: Date.now() - deferredAt,
          },
        });
        runNavigateToInbox();
      };
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          navigateOnce();
        }
      });

      setTimeout(() => {
        if (AppState.currentState === "active") {
          Sentry.addBreadcrumb({
            category: "navigation",
            message: "Using inbox notification active-state fallback",
            level: "info",
            data: { notificationId, source, deferredForMs: Date.now() - deferredAt },
          });
          navigateOnce();
        }
      }, 1_000);
      setTimeout(() => {
        if (didNavigate) return;
        Sentry.captureMessage("Inbox notification navigation still waiting for active app", {
          level: "warning",
          tags: {
            feature: "inbox-notifications",
            operation: "notification-cold-start-navigation",
          },
          extra: {
            notificationId,
            source,
            deferredForMs: Date.now() - deferredAt,
            ...getNavigationReadinessDebugData(),
          },
        });
      }, INBOX_NAVIGATION_ACTIVE_WATCHDOG_MS);
    } else {
      runNavigateToInbox();
    }
  } catch (error) {
    console.error("[InboxNotifications] Failed to navigate from notification:", error);
    Sentry.captureException(error, {
      tags: { action: "notification_navigate" },
    });
  }
}

function subscribeNotificationResponses(): void {
  if (notificationResponseSubscription) return;
  Sentry.addBreadcrumb({
    category: "inbox-notifications",
    message: "Subscribing to notification responses",
    level: "info",
    data: getNavigationReadinessDebugData(),
  });
  notificationResponseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Live notification response listener fired",
        level: "info",
        data: {
          notificationId: response.notification?.request?.identifier,
          notificationDate: response.notification?.date,
          dataKeys: getNotificationDataKeys(getNotificationData(response)),
          ...getNavigationReadinessDebugData(),
        },
      });
      handleNotificationResponse(response, "live-listener");
    });

  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Checked last notification response",
        level: "info",
        data: {
          hasResponse: !!response,
          notificationId: response?.notification?.request?.identifier,
          notificationDate: response?.notification?.date,
          dataKeys: response ? getNotificationDataKeys(getNotificationData(response)) : [],
          ...getNavigationReadinessDebugData(),
        },
      });
      handleNotificationResponse(response, "last-response");
    })
    .catch((error) => {
      console.error(
        "[InboxNotifications] Failed to read last notification response:",
        error,
      );
      Sentry.captureException(error, {
        tags: { feature: "inbox-notifications", operation: "last-notification-response" },
      });
    });
}

function subscribeInboxSignals(): void {
  if (unsubscribeInboxSignals) return;
  unsubscribeInboxSignals = useInboxStore.subscribe((state, prevState) => {
    if (!prevState) return;
    const lastViewedAt = state.lastViewedAt;
    const hasNewTimestamp =
      state.latestInboxTimestamp > prevState.latestInboxTimestamp &&
      (lastViewedAt <= 0 || state.latestInboxTimestamp > lastViewedAt);
    const hasUnreadIncrease =
      state.unreadCount > prevState.unreadCount && state.unreadCount > 0;

    if (hasNewTimestamp || hasUnreadIncrease) {
      runInboxCheck("signal").catch((error) => {
        console.error("[InboxNotifications] Signal check failed:", error);
        Sentry.captureException(error, {
          tags: { feature: "inbox-notifications", operation: "signal-check" },
        });
      });
    }
  });
}

TaskManager.defineTask(TASK_NAME, async () => {
  return await runInboxCheck("background");
});

export async function initInboxNotifications(): Promise<void> {
  if (isInboxNotificationsInitialized || isInitializingInboxNotifications) {
    return;
  }

  if (!useAuthStore.getState().walletAddress) {
    subscribeNotificationResponses();
    console.log("[InboxNotifications] No wallet, skipping notification init");
    Sentry.addBreadcrumb({
      category: "inbox-notifications",
      message: "Subscribed notification responses before wallet hydration",
      level: "info",
      data: { appState: AppState.currentState },
    });
    return;
  }

  isInitializingInboxNotifications = true;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("inbox", {
        name: "Inbox Replies",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    if (AppState.currentState !== "active") {
      console.log("[InboxNotifications] App not active, deferring init until foreground");
      scheduleInitInboxNotificationsOnForeground();
      return;
    }

    let finalStatus: Notifications.PermissionStatus;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      finalStatus = existingStatus;
      console.log("[InboxNotifications] Init - existing permission:", existingStatus);
    } catch (error) {
      if (isNotificationAccessDeferredError(error)) {
        console.warn("[InboxNotifications] Permission lookup deferred until foreground");
        scheduleInitInboxNotificationsOnForeground();
        return;
      }
      throw error;
    }

    if (finalStatus !== "granted") {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      } catch (error) {
        if (isNotificationAccessDeferredError(error)) {
          console.warn("[InboxNotifications] Permission request deferred until foreground");
          scheduleInitInboxNotificationsOnForeground();
          return;
        }
        throw error;
      }
    }

    console.log("[InboxNotifications] Init - final permission:", finalStatus);

    if (finalStatus !== "granted") {
      console.log("[InboxNotifications] Permission not granted, skipping background registration");
      return;
    }

    const walletAddress = useAuthStore.getState().walletAddress;
    if (walletAddress) {
      const isSeeded = storage.getString(SEEDED_KEY);
      if (!isSeeded) {
        await seedExistingReplies(walletAddress);
      }
      if (!storage.getString(SEED_TIMESTAMP_KEY)) {
        storage.set(SEED_TIMESTAMP_KEY, Math.floor(Date.now() / 1000).toString());
      }
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: FETCH_INTERVAL_SECONDS,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }

    subscribeInboxSignals();
    subscribeAppState();
    subscribeNotificationResponses();

    deferredInitSubscription?.remove();
    deferredInitSubscription = null;
    isInboxNotificationsInitialized = true;
    console.log("[InboxNotifications] Background fetch registered");
  } catch (error) {
    console.error("[InboxNotifications] Init failed:", error);
    Sentry.captureException(error, {
      tags: { action: "inbox_init" },
    });
  } finally {
    isInitializingInboxNotifications = false;
  }
}

export async function cleanupInboxNotificationsForLogout(): Promise<void> {
  Sentry.addBreadcrumb({
    category: "inbox-notifications",
    message: "Cleaning up inbox notifications for logout",
    level: "info",
    data: {
      hadForegroundPolling: foregroundInterval !== null,
      hadAppStateSubscription: appStateSubscription !== null,
      hadSignalSubscription: unsubscribeInboxSignals !== null,
      hadResponseSubscription: notificationResponseSubscription !== null,
    },
  });

  stopForegroundPolling();
  appStateSubscription?.remove();
  appStateSubscription = null;
  unsubscribeInboxSignals?.();
  unsubscribeInboxSignals = null;
  notificationResponseSubscription?.remove();
  notificationResponseSubscription = null;
  deferredInitSubscription?.remove();
  deferredInitSubscription = null;
  unsubscribeDeferredNotificationWalletWatcher?.();
  unsubscribeDeferredNotificationWalletWatcher = null;
  deferredNotificationResponseRetries.clear();
  deferredNotificationResponses.clear();
  deferredNotificationResponseReceivedAt.clear();
  isInboxNotificationsInitialized = false;
  isInitializingInboxNotifications = false;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
    }
    Sentry.addBreadcrumb({
      category: "inbox-notifications",
      message: "Inbox background fetch cleanup complete",
      level: "info",
      data: { wasRegistered: isRegistered },
    });
  } catch (error) {
    console.warn("[InboxNotifications] Failed to unregister background fetch:", error);
    Sentry.captureException(error, {
      tags: { feature: "inbox-notifications", operation: "logout-background-fetch-cleanup" },
    });
  }

  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();
    Sentry.addBreadcrumb({
      category: "inbox-notifications",
      message: "Cleared delivered and scheduled notifications on logout",
      level: "info",
    });
  } catch (error) {
    console.warn("[InboxNotifications] Failed to clear notifications on logout:", error);
    Sentry.captureException(error, {
      tags: { feature: "inbox-notifications", operation: "logout-notification-cleanup" },
    });
  }
}

export async function runInboxCheckNow(): Promise<void> {
  console.log("[InboxNotifications] Manual check triggered");
  const result = await runInboxCheck("manual");
  console.log("[InboxNotifications] Manual check result:", result);
}

export async function sendTestNotification(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    console.log("[InboxNotifications] Test - permission status:", status);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Mirage Test",
        body: "If you see this, notifications are working!",
        data: {},
      },
      trigger: null,
    });
    console.log("[InboxNotifications] Test notification scheduled, id:", id);
  } catch (error) {
    Sentry.captureException(error, { tags: { feature: "inbox-notifications", operation: "test-notification" } });
  }
}

export async function resetAndTestInboxNotification(): Promise<void> {
  console.log("[InboxNotifications] Resetting seeded data and running check...");
  saveInboxNotifiedIds(new Set());
  storage.remove(LAST_CHECK_KEY);
  storage.set(SEEDED_KEY, "true");
  const result = await runInboxCheck("manual");
  console.log("[InboxNotifications] Reset+check result:", result);
}

export function getNotificationDebugInfo(): {
  lastCheck: string;
  notifiedCount: number;
  isSeeded: boolean;
  bgStatus: string;
} {
  const lastCheckTs = storage.getString(LAST_CHECK_KEY);
  const notifiedIds = getNotifiedIds();
  const isSeeded = storage.getString(SEEDED_KEY) === "true";

  let lastCheck = "Never";
  if (lastCheckTs) {
    const date = new Date(parseInt(lastCheckTs, 10));
    lastCheck = date.toLocaleTimeString();
  }

  return {
    lastCheck,
    notifiedCount: notifiedIds.size,
    isSeeded,
    bgStatus: "Check logs for task execution",
  };
}
