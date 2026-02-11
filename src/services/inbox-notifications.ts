import * as Notifications from "expo-notifications";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { api } from "@/src/api/client";
import type { InboxResponse } from "@/src/api/types";
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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

async function seedExistingReplies(walletAddress: string): Promise<void> {
  try {
    const inbox = await api.get<InboxResponse>("/get_inbox", {
      address: walletAddress,
      limit: 50,
    });

    if (inbox.replies && inbox.replies.length > 0) {
      const ids = new Set(inbox.replies.map((r) => r.reply_id));
      saveNotifiedIds(ids);
    }

    storage.set(SEEDED_KEY, "true");
    storage.set(SEED_TIMESTAMP_KEY, Math.floor(Date.now() / 1000).toString());
    console.log("[InboxNotifications] Seeded existing replies, won't spam on first run");
  } catch (error) {
    console.error("[InboxNotifications] Seed failed:", error);
  }
}

async function checkAndNotify(): Promise<BackgroundFetch.BackgroundFetchResult> {
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

    const inbox = await api.get<InboxResponse>("/get_inbox", {
      address: walletAddress,
      limit: 50,
    });

    console.log("[InboxNotifications] Fetched replies:", inbox.replies?.length ?? 0);

    if (!inbox.replies || inbox.replies.length === 0) {
      storage.set(LAST_CHECK_KEY, Date.now().toString());
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const notifiedIds = getNotifiedIds();
    console.log("[InboxNotifications] Already notified IDs count:", notifiedIds.size);
    const newReplies = inbox.replies.filter((r) => !notifiedIds.has(r.reply_id));
    console.log("[InboxNotifications] New replies to notify:", newReplies.length);

    if (newReplies.length === 0) {
      storage.set(LAST_CHECK_KEY, Date.now().toString());
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    for (const reply of newReplies) {
      console.log("[InboxNotifications] Scheduling notification for:", reply.reply_id);
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `@${reply.reply_username} replied`,
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
      notifiedIds.add(reply.reply_id);
    }

    saveNotifiedIds(notifiedIds);
    useInboxStore.getState().addUnreadReplyIds(newReplies.map((r) => r.reply_id));
    storage.set(LAST_CHECK_KEY, Date.now().toString());

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error("[InboxNotifications] Check failed:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

TaskManager.defineTask(TASK_NAME, async () => {
  return await checkAndNotify();
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
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: FETCH_INTERVAL_SECONDS,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }

    console.log("[InboxNotifications] Background fetch registered");
  } catch (error) {
    console.error("[InboxNotifications] Init failed:", error);
  }
}

export async function runInboxCheckNow(): Promise<void> {
  console.log("[InboxNotifications] Manual check triggered");
  const result = await checkAndNotify();
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
    console.error("[InboxNotifications] Test notification failed:", error);
  }
}

export async function resetAndTestInboxNotification(): Promise<void> {
  console.log("[InboxNotifications] Resetting seeded data and running check...");
  storage.remove(NOTIFIED_IDS_KEY);
  storage.remove(LAST_CHECK_KEY);
  storage.set(SEEDED_KEY, "true");
  const result = await checkAndNotify();
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
