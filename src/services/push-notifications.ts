import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

import { registerPushToken, unregisterPushToken } from "@/src/api/write/endpoints/push-token";
import { walletService } from "@/src/services/wallet-service";
import { storage } from "@/src/stores/mmkv-storage";
import { markRepliesAsNotified } from "@/src/services/inbox-notified-ids";
import { queryClient } from "@/src/providers/query-provider";
import { queryKeys } from "@/src/api/read/query-keys";
import type { NodeConfigResponse } from "@/src/api/types";
import type { MirageWallet } from "@/src/wallet";
import { useAuthStore } from "@/src/stores/auth-store";
import { getInbox } from "@/src/api/read/endpoints/inbox";

const PUSH_TOKEN_KEY = "push-token";
const PUSH_ENABLED_KEY = "push-enabled";

let pushReceivedSubscription: Notifications.Subscription | null = null;
let appStateSubscription: { remove(): void } | null = null;
let isRegisteringPush = false;
let lastRegisterPushAt = 0;
const REGISTER_PUSH_MIN_INTERVAL_MS = 30_000;

function getStoredToken(): string | null {
  return storage.getString(PUSH_TOKEN_KEY) ?? null;
}

function storePushToken(token: string): void {
  storage.set(PUSH_TOKEN_KEY, token);
}

function clearStoredPushToken(): void {
  storage.remove(PUSH_TOKEN_KEY);
}

function isPushEnabled(): boolean {
  return storage.getString(PUSH_ENABLED_KEY) === "true";
}

function setPushEnabled(enabled: boolean): void {
  storage.set(PUSH_ENABLED_KEY, enabled ? "true" : "false");
}

async function getExpoPushToken(): Promise<string | null> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: `Permission not granted: ${status}`,
        level: "warning",
      });
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "25839d12-3bbc-4a6a-b1ee-67c4a6de816f",
    });
    return tokenData.data;
  } catch (error) {
    console.error("[PushNotifications] Failed to get Expo push token:", error);
    Sentry.captureException(error, {
      tags: { feature: "push-notifications", operation: "get-token" },
    });
    return null;
  }
}

export async function registerPush(wallet: MirageWallet): Promise<void> {
  if (isRegisteringPush) return;
  const now = Date.now();
  if (now - lastRegisterPushAt < REGISTER_PUSH_MIN_INTERVAL_MS) return;
  isRegisteringPush = true;
  try {
    const nodeConfig = queryClient.getQueryData<NodeConfigResponse>(queryKeys.nodeConfig());
    if (!nodeConfig?.push_notifications_enabled) {
      console.log("[PushNotifications] Push not enabled on this node, skipping");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "Push not enabled on node config, skipping registration",
        level: "info",
      });
      setPushEnabled(false);
      return;
    }

    const token = await getExpoPushToken();
    if (!token) {
      console.log("[PushNotifications] No push token available, falling back to polling");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "No push token available, falling back to polling",
        level: "warning",
      });
      setPushEnabled(false);
      return;
    }
    storePushToken(token);
    console.log("[PushNotifications] Stored push token locally:", token);

    const platform = Platform.OS as "ios" | "android";
    await registerPushToken(wallet, token, platform);

    setPushEnabled(true);
    console.log("[PushNotifications] Push token registered successfully:", token);
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "Push token registered successfully",
      data: { platform },
      level: "info",
    });
  } catch (error) {
    console.error("[PushNotifications] Registration failed, falling back to polling:", error);
    Sentry.captureException(error, {
      tags: { feature: "push-notifications", operation: "register" },
    });
    setPushEnabled(false);
  } finally {
    isRegisteringPush = false;
    lastRegisterPushAt = Date.now();
  }
}

export async function unregisterPush(wallet?: MirageWallet | null): Promise<void> {
  try {
    let token = getStoredToken();
    if (!token) {
      console.log("[PushNotifications] No stored push token found for unregister, fetching from Expo");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "No stored token for unregister, fetching from Expo",
        level: "info",
      });
      token = await getExpoPushToken();
      if (!token) {
        console.log("[PushNotifications] Could not recover push token for unregister");
        Sentry.addBreadcrumb({
          category: "push-notifications",
          message: "Could not recover push token for unregister",
          level: "warning",
        });
        return;
      }
      storePushToken(token);
      console.log("[PushNotifications] Recovered push token for unregister:", token);
    }
    console.log("[PushNotifications] Starting unregister for token:", token);

    const w = wallet ?? (await walletService.getWallet());
    if (!w) {
      console.log("[PushNotifications] No wallet available for unregister");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "No wallet available for unregister",
        level: "warning",
      });
      return;
    }
    console.log("[PushNotifications] Unregistering token for address:", w.address);

    await unregisterPushToken(w, token);
    console.log("[PushNotifications] Push token unregistered:", token);
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "Push token unregistered successfully",
      level: "info",
    });
  } catch (error) {
    console.error("[PushNotifications] Unregister failed:", error);
    Sentry.captureException(error, {
      tags: { feature: "push-notifications", operation: "unregister" },
    });
  } finally {
    console.log("[PushNotifications] Clearing stored push token and disabling push state");
    clearStoredPushToken();
    setPushEnabled(false);
  }
}

function subscribePushReceived(): void {
  if (pushReceivedSubscription) return;

  pushReceivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    if (data?.replyId) {
      markRepliesAsNotified([data.replyId as string]);
    }
    const address = useAuthStore.getState().walletAddress;
    if (address) {
      queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.inboxInfinite(address),
        queryFn: ({ pageParam = 1 }) => getInbox({ address, page: pageParam, limit: 25 }),
        initialPageParam: 1,
      });
    }
  });
}

function subscribeAppStateForegroundReRegister(): void {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener("change", async (nextState) => {
    if (nextState !== "active") return;
    if (!isPushEnabled()) return;

    try {
      const wallet = await walletService.getWallet();
      if (!wallet) return;
      await registerPush(wallet);
    } catch (error) {
      console.error("[PushNotifications] Foreground re-register failed:", error);
      Sentry.captureException(error, {
        tags: { feature: "push-notifications", operation: "foreground-re-register" },
      });
    }
  });
}

export async function initPushNotifications(): Promise<void> {
  Sentry.addBreadcrumb({
    category: "push-notifications",
    message: "Initializing push notifications service",
    level: "info",
  });
  subscribePushReceived();
  subscribeAppStateForegroundReRegister();
}

export function cleanupPushNotifications(): void {
  pushReceivedSubscription?.remove();
  pushReceivedSubscription = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
}

export { isPushEnabled };
