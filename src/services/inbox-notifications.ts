import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import type { InfiniteData } from "@tanstack/react-query";

import * as Sentry from "@sentry/react-native";
import * as Network from "expo-network";
import { isAxiosError } from "axios";
import { api } from "@/src/api/client";
import { queryKeys } from "@/src/api/read/query-keys";
import type { InboxReply, InboxResponse } from "@/src/api/types";
import { queryClient } from "@/src/providers/query-provider";
import { storage } from "@/src/stores/mmkv-storage";
import { useAuthStore } from "@/src/stores/auth-store";
import { useInboxStore } from "@/src/stores/inbox-store";
import { isPushEnabled } from "@/src/services/push-notifications";
import {
  getInboxNotifiedIds,
  saveInboxNotifiedIds,
} from "@/src/services/inbox-notified-ids";

const TASK_NAME = "INBOX_NOTIFICATION_CHECK";
const LAST_CHECK_KEY = "inbox-last-check-ts";
const SEEDED_KEY = "inbox-notified-seeded";
const SEED_TIMESTAMP_KEY = "inbox-seed-timestamp";
const FETCH_INTERVAL_SECONDS = 15 * 60;
const FOREGROUND_INTERVAL_MS = FETCH_INTERVAL_SECONDS * 1000;
const SIGNAL_THROTTLE_MS = 15_000;
const INBOX_NAVIGATION_READY_TIMEOUT_MS = 3_000;
const INBOX_NOTIFICATION_NAVIGATION_ACTIVE_MS = 10_000;

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
  return Date.now() - lastInboxNotificationNavigationAt < INBOX_NOTIFICATION_NAVIGATION_ACTIVE_MS;
}

function markInboxNotificationNavigationActive(): void {
  lastInboxNotificationNavigationAt = Date.now();
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
  };
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

function waitForTabsReady(timeoutMs = 5000): Promise<boolean> {
  let didSettle = false;
  return Promise.race([
    Promise.all([_rootLayoutReadyPromise, _tabsReadyPromise]).then(() => {
      if (didSettle) return true;
      didSettle = true;
      Sentry.addBreadcrumb({
        category: "notifications",
        message: "Navigation tree ready before inbox notification navigation",
        level: "info",
      });
      return true;
    }),
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        if (!didSettle) {
          didSettle = true;
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
        }
        resolve(false);
      }, timeoutMs),
    ),
  ]);
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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function formatMirageAmount(amountUmirage: number): string {
  const value = amountUmirage / 1_000_000;
  const text = value % 1 === 0 ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return text;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toOptionalNumber(value: unknown): number | undefined {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeInboxReplyType(value: unknown): InboxReply["type"] {
  switch (value) {
    case "reply":
    case "mention":
    case "award":
    case "donation":
    case "follow":
    case "subscription_gift":
      return value;
    default:
      return "reply";
  }
}

function getNotificationData(
  response: Notifications.NotificationResponse,
): Record<string, unknown> {
  return (response.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
}

function getNotificationDataKeys(data: Record<string, unknown>): string[] {
  return Object.keys(data).slice(0, 20);
}

function isAndroidShareIntentNotificationData(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return keys.some((key) =>
    key === "android.intent.extra.TEXT" ||
    key === "android.intent.extra.STREAM" ||
    key === "android.intent.extra.SUBJECT" ||
    key.startsWith("android.intent.extra.")
  );
}

function getFallbackInboxNotificationResponseId(
  response: Notifications.NotificationResponse,
  data: Record<string, unknown>,
): string {
  const notificationDate = response.notification?.date ?? Date.now();
  const dataKeys = getNotificationDataKeys(data).join(",") || "no-data";
  Sentry.addBreadcrumb({
    category: "inbox-notifications",
    message: "Using fallback inbox notification response id",
    level: "warning",
    data: {
      actionIdentifier: response.actionIdentifier,
      requestIdentifier: response.notification?.request?.identifier,
      notificationDate,
      dataKeys: getNotificationDataKeys(data),
      hasNotificationType: !!data.notificationType,
      hasReplyId: !!toOptionalString(data.replyId),
      hasRootPostId: !!toOptionalString(data.rootPostId),
      hasInboxReply: !!data.inboxReply,
    },
  });
  return `inbox-notification:${response.actionIdentifier}:${notificationDate}:${dataKeys}`;
}

function getInboxNotificationResponseId(
  response: Notifications.NotificationResponse,
  data: Record<string, unknown>,
): string {
  const explicitNotificationId = toOptionalString(data.notificationId);
  if (explicitNotificationId) return explicitNotificationId;

  const replyId = toOptionalString(data.replyId);
  if (replyId) return `inbox-reply:${replyId}`;

  const rootPostId = toOptionalString(data.rootPostId);
  if (rootPostId) return `inbox-root:${rootPostId}`;

  const snapshot = data.inboxReply;
  if (snapshot && typeof snapshot === "object") {
    const snapshotReplyId = toOptionalString(
      (snapshot as Record<string, unknown>).reply_id,
    );
    if (snapshotReplyId) return `inbox-reply:${snapshotReplyId}`;
  }

  const requestId = toOptionalString(response.notification?.request?.identifier);
  if (requestId) return requestId;

  return getFallbackInboxNotificationResponseId(response, data);
}

function buildPreviewReplyFromNotification(
  notification: Notifications.Notification,
): InboxReply | null {
  const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
  const snapshot = data.inboxReply;
  const notificationDate = notification.date;
  const replyTimestamp = notificationDate
    ? Math.floor((notificationDate < 1e12 ? notificationDate * 1000 : notificationDate) / 1000)
    : Math.floor(Date.now() / 1000);

  if (snapshot && typeof snapshot === "object") {
    const candidate = snapshot as Record<string, unknown>;
    const replyId = toOptionalString(candidate.reply_id);
    const rootPostId = toOptionalString(candidate.root_post_id);
    if (replyId && rootPostId) {
      return {
        reply_id: replyId,
        reply_owner: toOptionalString(candidate.reply_owner) ?? "",
        reply_username: toOptionalString(candidate.reply_username) ?? "Someone",
        reply_content: toOptionalString(candidate.reply_content) ?? "",
        reply_timestamp:
          toOptionalNumber(candidate.reply_timestamp) ?? replyTimestamp,
        reply_author_level:
          toOptionalNumber(candidate.reply_author_level) ?? 0,
        parent_id: toOptionalString(candidate.parent_id) ?? rootPostId,
        parent_content: toOptionalString(candidate.parent_content) ?? "",
        parent_owner: toOptionalString(candidate.parent_owner) ?? "",
        root_post_id: rootPostId,
        type: normalizeInboxReplyType(candidate.type),
        award_type: toOptionalString(candidate.award_type) ?? undefined,
        amount: toOptionalNumber(candidate.amount),
      };
    }
  }

  const replyId = toOptionalString(data.replyId);
  const rootPostId = toOptionalString(data.rootPostId);
  if (!replyId || !rootPostId) {
    return null;
  }

  const title = notification.request.content.title?.trim() ?? "";
  const body = notification.request.content.body?.trim() ?? "";
  const fallbackUsername = title.match(/^@?([^\s]+)/)?.[1] ?? "Someone";

  return {
    reply_id: replyId,
    reply_owner: toOptionalString(data.replyOwner) ?? "",
    reply_username: toOptionalString(data.replyUsername) ?? fallbackUsername,
    reply_content: toOptionalString(data.replyContent) ?? body,
    reply_timestamp: replyTimestamp,
    reply_author_level: toOptionalNumber(data.replyAuthorLevel) ?? 0,
    parent_id: toOptionalString(data.parentId) ?? rootPostId,
    parent_content: toOptionalString(data.parentContent) ?? "",
    parent_owner: toOptionalString(data.parentOwner) ?? "",
    root_post_id: rootPostId,
    type: normalizeInboxReplyType(data.type),
    award_type: toOptionalString(data.awardType) ?? undefined,
    amount: toOptionalNumber(data.amount),
  };
}

function getNotificationBody(reply: InboxResponse["replies"][number]): string {
  if (reply.type === "donation") {
    return "You received a donation";
  }
  if (reply.type === "follow") {
    return "Tap to view their profile";
  }
  if (reply.type === "subscription_gift") {
    return "Welcome to Mirage";
  }
  if (reply.type === "award") {
    return `Your post received a ${reply.award_type ?? ""}  award`;
  }
  return truncate(reply.reply_content, 150);
}

function getNotificationTitle(reply: InboxResponse["replies"][number]): string {
  const displayName = reply.reply_username ? `@${reply.reply_username}` : reply.reply_owner?.slice(0, 12) ?? "";
  if (reply.type === "mention") {
    return `${displayName} mentioned you`;
  }
  if (reply.type === "donation") {
    const amount = formatMirageAmount(reply.amount ?? 0);
    return `${displayName} donated ${amount} MIRAGE`;
  }
  if (reply.type === "follow") {
    return `${displayName} followed you`;
  }
  if (reply.type === "subscription_gift") {
    return `${displayName} gifted you a subscription`;
  }
  if (reply.type === "award") {
    return `${displayName} gave you an award`;
  }
  return `${displayName} replied`;
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
              rootPostId: reply.root_post_id,
              replyId: reply.reply_id,
              type: reply.type,
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
const DEFERRED_NOTIFICATION_RESPONSE_MAX_RETRIES = 12;
const DEFERRED_NOTIFICATION_RESPONSE_RETRY_MS = 500;

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

function deferNotificationResponseUntilWallet(
  response: Notifications.NotificationResponse,
  notificationId: string,
): void {
  const attempt = (deferredNotificationResponseRetries.get(notificationId) ?? 0) + 1;
  deferredNotificationResponseRetries.set(notificationId, attempt);

  Sentry.addBreadcrumb({
    category: "inbox-notifications",
    message: "Deferring notification response until wallet is ready",
    level: "info",
    data: {
      notificationId,
      attempt,
      ...getNavigationReadinessDebugData(),
    },
  });

  if (attempt > DEFERRED_NOTIFICATION_RESPONSE_MAX_RETRIES) {
    deferredNotificationResponseRetries.delete(notificationId);
    Sentry.captureMessage("Inbox notification response dropped before wallet ready", {
      level: "warning",
      tags: {
        feature: "inbox-notifications",
        operation: "deferred-notification-response",
      },
      extra: {
        notificationId,
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

    deferredNotificationResponseRetries.delete(notificationId);
    Sentry.captureMessage("Inbox notification response resumed after wallet ready", {
      level: "info",
      tags: {
        feature: "inbox-notifications",
        operation: "deferred-notification-response",
      },
      extra: {
        notificationId,
        attempt,
        ...getNavigationReadinessDebugData(),
      },
    });
    handleNotificationResponse(response, "wallet-deferred");
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
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Ignoring Android share intent in notification response handler",
        level: "info",
        data: {
          source,
          actionIdentifier: response.actionIdentifier,
          requestIdentifier: response.notification?.request?.identifier,
          notificationDate: response.notification?.date,
          dataKeys: getNotificationDataKeys(notificationData),
          hasSharedText: !!toOptionalString(notificationData["android.intent.extra.TEXT"]),
          ...getNavigationReadinessDebugData(),
        },
      });
      return;
    }
    const notificationId = getInboxNotificationResponseId(response, notificationData);
    markInboxNotificationNavigationActive();
    Sentry.addBreadcrumb({
      category: "notifications",
      message: "Inbox notification response received",
      level: "info",
      data: {
        notificationId,
        source,
        actionIdentifier: response.actionIdentifier,
        appState: AppState.currentState,
        notificationDate: response.notification?.date,
        requestIdentifier: response.notification?.request?.identifier,
        dataKeys: getNotificationDataKeys(notificationData),
        hasNotificationType: !!notificationData.notificationType,
        hasReplyId: !!toOptionalString(notificationData.replyId),
        hasRootPostId: !!toOptionalString(notificationData.rootPostId),
        hasInboxReply: !!notificationData.inboxReply,
        ...getNavigationReadinessDebugData(),
      },
    });
    const handledNotificationIds = getHandledNotificationIds();
    if (
      handledNotificationIds.has(notificationId) ||
      handledNotificationIdsInFlight.has(notificationId)
    ) {
      console.log("[InboxNotifications] Already handled notification:", notificationId);
      Sentry.addBreadcrumb({
        category: "notifications",
        message: "Inbox notification response already handled",
        level: "info",
        data: { notificationId },
      });
      return;
    }
    if (!useAuthStore.getState().walletAddress) {
      console.log("[InboxNotifications] Deferring notification response until wallet is ready");
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Notification response received before wallet is ready",
        level: "info",
        data: { notificationId, source, ...getNavigationReadinessDebugData() },
      });
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
    Sentry.addBreadcrumb({
      category: "notifications",
      message: "Inbox notification target resolved",
      level: "info",
      data: {
        notificationId,
        hasPreviewReply: !!previewReply,
        hasReplyId: !!replyId,
        hasRootPostId: !!rootPostId,
      },
    });
    useInboxStore.getState().setNotificationTarget({
      notificationId,
      replyId,
      rootPostId,
      previewReply,
    });
    const prefetchInbox = async () => {
      const address = useAuthStore.getState().walletAddress;
      if (!address) return;
      await fetchAndSeedInboxCache(address, 25);
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
      });
      const areTabsReady = await waitForTabsReady(INBOX_NAVIGATION_READY_TIMEOUT_MS);
      if (!areTabsReady) {
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Proceeding with inbox notification navigation after tabs wait timeout",
          level: "warning",
          data: { notificationId, ...getNavigationReadinessDebugData() },
        });
      }
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Dispatching inbox notification navigation",
        level: "info",
        data: {
          notificationId,
          hasReplyId: !!replyId,
          hasRootPostId: !!rootPostId,
          areTabsReady,
          ...getNavigationReadinessDebugData(),
        },
      });
      router.navigate({
        pathname: "/(tabs)/inbox",
        params: {
          fromNotification: notificationId,
          replyId: replyId ?? undefined,
        },
      });
      Sentry.captureMessage("Inbox notification navigation dispatched", {
        level: "info",
        tags: {
          feature: "inbox-notifications",
          operation: "notification-navigate",
        },
        extra: {
          notificationId,
          hasReplyId: !!replyId,
          hasRootPostId: !!rootPostId,
          areTabsReady,
          appState: AppState.currentState,
          ...getNavigationReadinessDebugData(),
        },
      });
      handledNotificationIds.add(notificationId);
      saveHandledNotificationIds(handledNotificationIds);
    };
    const runNavigateToInbox = () => {
      void navigateToInbox().catch((error) => {
        handledNotificationIdsInFlight.delete(notificationId);
        console.error("[InboxNotifications] Failed to navigate from notification:", error);
        Sentry.captureException(error, {
          tags: { action: "notification_navigate" },
        });
      });
    };
    if (AppState.currentState !== "active") {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Deferring inbox notification navigation until app active",
        level: "info",
        data: { notificationId, appState: AppState.currentState },
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
          data: { notificationId, appState: AppState.currentState },
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
            data: { notificationId },
          });
          navigateOnce();
        }
      }, 1_000);
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
