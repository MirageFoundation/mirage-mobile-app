import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import type { InfiniteData } from "@tanstack/react-query";

import * as Sentry from "@sentry/react-native";
import * as Network from "expo-network";
import axios from "axios";
import { api } from "@/src/api/client";
import { queryKeys } from "@/src/api/read/query-keys";
import type { InboxResponse } from "@/src/api/types";
import { queryClient } from "@/src/providers/query-provider";
import { storage } from "@/src/stores/mmkv-storage";
import { useAuthStore } from "@/src/stores/auth-store";
import { useInboxStore } from "@/src/stores/inbox-store";

const TASK_NAME = "INBOX_NOTIFICATION_CHECK";
const NOTIFIED_IDS_KEY = "inbox-notified-ids";
const LAST_CHECK_KEY = "inbox-last-check-ts";
const SEEDED_KEY = "inbox-notified-seeded";
const SEED_TIMESTAMP_KEY = "inbox-seed-timestamp";
const MAX_NOTIFIED_IDS = 500;
const FETCH_INTERVAL_SECONDS = 15 * 60;
const FOREGROUND_INTERVAL_MS = FETCH_INTERVAL_SECONDS * 1000;
const SIGNAL_THROTTLE_MS = 15_000;

let isCheckInFlight = false;
let lastSignalCheckAt = 0;
let foregroundInterval: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove(): void } | null = null;
let unsubscribeInboxSignals: (() => void) | null = null;
let notificationResponseSubscription: Notifications.Subscription | null = null;

let _tabsReadyResolve: (() => void) | null = null;
let _tabsReadyPromise: Promise<void> = new Promise<void>((resolve) => {
  _tabsReadyResolve = resolve;
});

export function signalTabsReady(): void {
  _tabsReadyResolve?.();
}

function waitForTabsReady(timeoutMs = 5000): Promise<void> {
  return Promise.race([
    _tabsReadyPromise,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    console.log("[InboxNotifications] handleNotification called for:", notification.request.identifier);
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export function getNotifiedIds(): Set<string> {
  const raw = storage.getString(NOTIFIED_IDS_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function getSeedTimestamp(): number {
  const raw = storage.getString(SEED_TIMESTAMP_KEY);
  if (!raw) return 0;
  return parseInt(raw, 10) || 0;
}

function saveNotifiedIds(ids: Set<string>): void {
  const arr = Array.from(ids);
  const trimmed = arr.length > MAX_NOTIFIED_IDS
    ? arr.slice(arr.length - MAX_NOTIFIED_IDS)
    : arr;
  storage.set(NOTIFIED_IDS_KEY, JSON.stringify(trimmed));
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

export function markRepliesAsNotified(replyIds: string[]): void {
  if (replyIds.length === 0) return;
  const existing = getNotifiedIds();
  for (const id of replyIds) {
    existing.add(id);
  }
  saveNotifiedIds(existing);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function getNotificationTitle(reply: InboxResponse["replies"][number]): string {
  if (reply.type === "mention") {
    return `@${reply.reply_username} mentioned you`;
  }
  return `@${reply.reply_username} replied`;
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
    if (axios.isAxiosError(error) && error.message === "Network Error") {
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

    const inbox = await api.get<InboxResponse>("/get_inbox", {
      address: walletAddress,
      limit: 50,
    });

    console.log("[InboxNotifications] Fetched replies:", inbox.replies?.length ?? 0);
    seedInboxCache(walletAddress, inbox);

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
      notifiedIds.add(reply.reply_id);
      saveNotifiedIds(notifiedIds);

      console.log("[InboxNotifications] Scheduling notification for:", reply.reply_id);
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: getNotificationTitle(reply),
          body: truncate(reply.reply_content, 150),
          data: {
            rootPostId: reply.root_post_id,
            replyId: reply.reply_id,
          },
          ...(Platform.OS === "android" && {
            categoryIdentifier: "inbox",
          }),
        },
        trigger: null,
      });
      console.log("[InboxNotifications] Scheduled notification id:", id);
    }

    storage.set(LAST_CHECK_KEY, Date.now().toString());

    return unreadReplies.length > 0
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    if (axios.isAxiosError(error) && error.message === "Network Error") {
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

const STALE_NOTIFICATION_MS = 5 * 60_000;
const HANDLED_NOTIFICATION_IDS_KEY = "inbox-handled-notification-ids";

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

function handleNotificationResponse(
  response: Notifications.NotificationResponse | null
): void {
  if (!response) return;
  try {
    const notificationId = response.notification?.request?.identifier;
    if (!notificationId) return;
    const handledNotificationIds = getHandledNotificationIds();
    if (handledNotificationIds.has(notificationId)) {
      console.log("[InboxNotifications] Already handled notification:", notificationId);
      return;
    }
    const responseDate = response.notification?.date;
    if (!responseDate) {
      console.log("[InboxNotifications] No date on notification, ignoring:", notificationId);
      return;
    }
    const dateMs = responseDate < 1e12 ? responseDate * 1000 : responseDate;
    const ageMs = Date.now() - dateMs;
    if (ageMs > STALE_NOTIFICATION_MS) {
      console.log("[InboxNotifications] Ignoring stale notification response, age:", ageMs);
      return;
    }
    handledNotificationIds.add(notificationId);
    saveHandledNotificationIds(handledNotificationIds);
    const navigateToInbox = async () => {
      await waitForTabsReady();
      router.navigate({
        pathname: "/(tabs)/inbox",
        params: { fromNotification: notificationId },
      });
    };
    if (AppState.currentState !== "active") {
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          sub.remove();
          navigateToInbox();
        }
      });
    } else {
      navigateToInbox();
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
  notificationResponseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });

  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      handleNotificationResponse(response);
    })
    .catch((error) => {
      console.error(
        "[InboxNotifications] Failed to read last notification response:",
        error,
      );
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
      });
    }
  });
}

TaskManager.defineTask(TASK_NAME, async () => {
  return await runInboxCheck("background");
});

export async function initInboxNotifications(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("inbox", {
        name: "Inbox Replies",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    console.log("[InboxNotifications] Init - existing permission:", existingStatus);

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
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

    console.log("[InboxNotifications] Background fetch registered");
  } catch (error) {
    console.error("[InboxNotifications] Init failed:", error);
    Sentry.captureException(error, {
      tags: { action: "inbox_init" },
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
  storage.remove(NOTIFIED_IDS_KEY);
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
