import * as Notifications from "expo-notifications";
import * as Network from "expo-network";
import { AppState, type NativeEventSubscription, Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

import {
  buildUnregisterPushTokenRequest,
  postUnregisterPushToken,
  registerPushToken,
  type UnregisterPushTokenRequest,
} from "@/src/api/write/endpoints/push-token";
import { walletService } from "@/src/services/wallet-service";
import { storage } from "@/src/stores/mmkv-storage";
import { markRepliesAsNotified } from "@/src/services/inbox-notified-ids";
import { queryClient } from "@/src/providers/query-provider";
import { queryKeys } from "@/src/api/read/query-keys";
import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import { apiClient } from "@/src/api/client";
import type { NodeConfigResponse } from "@/src/api/types";
import type { MirageWallet } from "@/src/wallet";
import { useAuthStore } from "@/src/stores/auth-store";
import { getInbox } from "@/src/api/read/endpoints/inbox";
import { isRetryable } from "@/src/utils/error-messages";

const PUSH_TOKEN_KEY = "push-token";
const PUSH_ENABLED_KEY = "push-enabled";
const PENDING_UNREGISTER_KEY = "push-pending-unregisters";
const TOKEN_FETCH_MAX_RETRIES = 3;
const TOKEN_FETCH_BASE_DELAY_MS = 1_000;
const UNREGISTER_MAX_RETRIES = 3;
const UNREGISTER_BASE_DELAY_MS = 2_000;

let pushReceivedSubscription: Notifications.Subscription | null = null;
let appStateSubscription: { remove(): void } | null = null;
let networkSubscription: { remove(): void } | null = null;
let needsNetworkRetry = false;
let isRegisteringPush = false;
let lastRegisterPushAt = 0;
const REGISTER_PUSH_MIN_INTERVAL_MS = 30_000;
let unhandledRejectionHandler: ((event: any) => void) | null = null;
let pendingUnregisterFlushPromise: Promise<boolean> | null = null;

type PendingUnregister = {
  id: string;
  token: string;
  address: string;
  baseUrl?: string;
  request: UnregisterPushTokenRequest;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
};

function isKeychainAccessError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("getregistrationinfoasync") ||
      msg.includes("keychain access failed") ||
      msg.includes("user interaction is not allowed")
    );
  }
  return false;
}

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("network request failed") ||
      msg.includes("err_notifications_server_error") ||
      msg.includes("timeout") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}

function isOfflineRegistrationError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === "ERR_NETWORK") {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg === "network error" || msg.includes("network error") || msg.includes("offline");
  }

  return false;
}

function isRetryablePushError(error: unknown): boolean {
  const status = (error as any)?.response?.status;
  const errorCode = (error as any)?.response?.data?.error_code;
  return (
    isOfflineRegistrationError(error) ||
    isTransientNetworkError(error) ||
    status === 503 ||
    status === 521 ||
    status === 429 ||
    (typeof errorCode === "string" && isRetryable(errorCode))
  );
}

function getPushErrorDetails(error: unknown): Record<string, unknown> {
  const response = (error as any)?.response;
  return {
    code: (error as any)?.code,
    status: response?.status,
    errorCode: response?.data?.error_code,
    message: error instanceof Error ? error.message : String(error),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAppInForeground(): boolean {
  return AppState.currentState === "active";
}

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

function readPendingUnregisters(): PendingUnregister[] {
  const raw = storage.getString(PENDING_UNREGISTER_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[PushNotifications] Failed to parse pending unregisters, clearing queue");
    Sentry.captureException(error, {
      tags: { feature: "push-notifications", operation: "parse-pending-unregisters" },
    });
    storage.remove(PENDING_UNREGISTER_KEY);
    return [];
  }
}

function writePendingUnregisters(items: PendingUnregister[]): void {
  if (items.length === 0) {
    storage.remove(PENDING_UNREGISTER_KEY);
    return;
  }

  storage.set(PENDING_UNREGISTER_KEY, JSON.stringify(items));
}

function queuePendingUnregister(item: PendingUnregister): void {
  const existing = readPendingUnregisters().filter((pending) => pending.id !== item.id);
  writePendingUnregisters([...existing, item]);
  needsNetworkRetry = true;
  console.log("[PushNotifications] Queued pending push unregister for address:", item.address);
}

async function postUnregisterWithRetry(
  request: UnregisterPushTokenRequest,
  baseUrl?: string,
): Promise<void> {
  for (let attempt = 0; attempt < UNREGISTER_MAX_RETRIES; attempt++) {
    try {
      await postUnregisterPushToken(request, baseUrl);
      return;
    } catch (error) {
      if (!isRetryablePushError(error) || attempt >= UNREGISTER_MAX_RETRIES - 1) {
        throw error;
      }

      const backoff = UNREGISTER_BASE_DELAY_MS * Math.pow(2, attempt);
      console.log(
        `[PushNotifications] Unregister retry in ${backoff}ms (attempt ${attempt + 1}/${UNREGISTER_MAX_RETRIES})`,
      );
      await delay(backoff);
    }
  }
}

async function performPendingUnregisterFlush(): Promise<boolean> {
  const pending = readPendingUnregisters();
  if (pending.length === 0) return true;

  console.log("[PushNotifications] Flushing pending unregisters:", pending.length);
  Sentry.addBreadcrumb({
    category: "push-notifications",
    message: "Flushing pending push unregisters",
    level: "info",
    data: { count: pending.length },
  });
  const remaining: PendingUnregister[] = [];

  for (const item of pending) {
    try {
      await postUnregisterWithRetry(item.request, item.baseUrl);
      console.log("[PushNotifications] Pending push token unregistered:", item.token);
    } catch (error) {
      const nextItem = {
        ...item,
        attempts: item.attempts + 1,
        lastAttemptAt: Date.now(),
      };

      if (isRetryablePushError(error)) {
        console.warn(
          "[PushNotifications] Pending unregister still retryable:",
          getPushErrorDetails(error),
        );
        Sentry.addBreadcrumb({
          category: "push-notifications",
          message: "Pending unregister retry remains queued",
          level: "warning",
          data: {
            address: item.address,
            attempts: nextItem.attempts,
            ...getPushErrorDetails(error),
          },
        });
        remaining.push(nextItem);
      } else {
        console.warn("[PushNotifications] Dropping non-retryable pending unregister:", error);
        Sentry.captureException(error, {
          tags: { feature: "push-notifications", operation: "pending-unregister-non-retryable" },
          extra: { address: item.address, attempts: nextItem.attempts },
        });
      }
    }
  }

  writePendingUnregisters(remaining);
  needsNetworkRetry = remaining.length > 0;
  Sentry.addBreadcrumb({
    category: "push-notifications",
    message: "Pending push unregister flush complete",
    level: remaining.length > 0 ? "warning" : "info",
    data: {
      remaining: remaining.length,
      attempts: remaining.map((item) => item.attempts),
    },
  });
  return remaining.length === 0;
}

async function flushPendingUnregisters(): Promise<boolean> {
  if (pendingUnregisterFlushPromise) {
    console.log("[PushNotifications] Reusing pending unregister flush");
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "Reusing in-flight pending unregister flush",
      level: "info",
      data: { pendingCount: readPendingUnregisters().length },
    });
    return pendingUnregisterFlushPromise;
  }

  pendingUnregisterFlushPromise = performPendingUnregisterFlush().finally(() => {
    pendingUnregisterFlushPromise = null;
  });
  return pendingUnregisterFlushPromise;
}

async function getExpoPushToken(): Promise<string | null> {
  if (!isAppInForeground()) {
    console.log("[PushNotifications] Skipping token fetch — app is not in foreground");
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "Skipped token fetch: app not in foreground",
      level: "info",
    });
    return null;
  }

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
  } catch (error) {
    if (isKeychainAccessError(error)) {
      console.warn("[PushNotifications] Keychain access denied during permission request, will retry on foreground");
      needsNetworkRetry = true;
      return null;
    }
    throw error;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < TOKEN_FETCH_MAX_RETRIES; attempt++) {
    try {
      if (!isAppInForeground()) {
        console.log("[PushNotifications] App left foreground, aborting token fetch");
        return null;
      }

      let foregroundSub: NativeEventSubscription | null = null;
      const tokenData = await Promise.race([
        Notifications.getExpoPushTokenAsync({
          projectId: "25839d12-3bbc-4a6a-b1ee-67c4a6de816f",
        }),
        new Promise<never>((_, reject) => {
          foregroundSub = AppState.addEventListener("change", (state) => {
            if (state !== "active") {
              reject(new Error("App left foreground during token fetch"));
            }
          });
        }),
      ]).finally(() => {
        foregroundSub?.remove();
      });
      return tokenData.data;
    } catch (error) {
      lastError = error;

      if (error instanceof Error && error.message === "App left foreground during token fetch") {
        console.log("[PushNotifications] App left foreground during token fetch, will retry on foreground");
        needsNetworkRetry = true;
        return null;
      }

      if (isKeychainAccessError(error)) {
        console.warn("[PushNotifications] Keychain access denied (device likely locked/background), will retry on foreground");
        Sentry.addBreadcrumb({
          category: "push-notifications",
          message: "Keychain access denied — suppressed, will retry on foreground",
          level: "warning",
        });
        needsNetworkRetry = true;
        return null;
      }

      if (isTransientNetworkError(error) && attempt < TOKEN_FETCH_MAX_RETRIES - 1) {
        const backoff = TOKEN_FETCH_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[PushNotifications] Token fetch failed (attempt ${attempt + 1}/${TOKEN_FETCH_MAX_RETRIES}), retrying in ${backoff}ms`);
        Sentry.addBreadcrumb({
          category: "push-notifications",
          message: `Token fetch retry ${attempt + 1}/${TOKEN_FETCH_MAX_RETRIES} after ${backoff}ms`,
          level: "warning",
        });
        await delay(backoff);
        continue;
      }

      break;
    }
  }

  console.error("[PushNotifications] Failed to get Expo push token after retries:", lastError);
  if (isTransientNetworkError(lastError)) {
    needsNetworkRetry = true;
  }
  Sentry.captureException(lastError, {
    tags: { feature: "push-notifications", operation: "get-token" },
    extra: { retries: TOKEN_FETCH_MAX_RETRIES },
  });
  return null;
}

export async function registerPush(wallet: MirageWallet): Promise<void> {
  if (isRegisteringPush) return;
  const now = Date.now();
  if (now - lastRegisterPushAt < REGISTER_PUSH_MIN_INTERVAL_MS) return;
  isRegisteringPush = true;
  try {
    const flushedPendingUnregisters = await flushPendingUnregisters();
    if (!flushedPendingUnregisters) {
      console.log("[PushNotifications] Skipping registration until old token unregisters finish");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "Skipped registration: pending unregisters remain",
        level: "warning",
      });
      setPushEnabled(false);
      return;
    }

    const nodeConfig =
      queryClient.getQueryData<NodeConfigResponse>(queryKeys.nodeConfig()) ??
      (await queryClient.fetchQuery<NodeConfigResponse>({
        queryKey: queryKeys.nodeConfig(),
        queryFn: getNodeConfig,
      }));
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
    needsNetworkRetry = false;
    console.log("[PushNotifications] Push token registered successfully:", token);
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "Push token registered successfully",
      data: { platform },
      level: "info",
    });
  } catch (error) {
    if (isKeychainAccessError(error)) {
      console.warn("[PushNotifications] Keychain access denied during registration, will retry on foreground");
      needsNetworkRetry = true;
    } else if (isOfflineRegistrationError(error) || isTransientNetworkError(error)) {
      needsNetworkRetry = true;
      console.log("[PushNotifications] Registration skipped: network unavailable, falling back to polling");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "Push registration skipped: network unavailable",
        level: "warning",
      });
    } else {
      const is429 = (error as any)?.response?.status === 429;
      if (is429) {
        needsNetworkRetry = true;
        console.log("[PushNotifications] Registration rate limited, will retry on next foreground");
      } else {
        console.error("[PushNotifications] Registration failed, falling back to polling:", error);
        Sentry.captureException(error, {
          tags: { feature: "push-notifications", operation: "register" },
        });
      }
    }
    setPushEnabled(false);
  } finally {
    isRegisteringPush = false;
    lastRegisterPushAt = Date.now();
  }
}

export async function unregisterPush(wallet?: MirageWallet | null): Promise<void> {
  let didUnregister = false;
  let unregisterToken: string | null = null;
  let unregisterWallet: MirageWallet | null = null;
  let unregisterRequest: UnregisterPushTokenRequest | null = null;
  let unregisterBaseUrl: string | undefined;
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

    unregisterToken = token;
    unregisterWallet = w;
    unregisterBaseUrl = apiClient.getCurrentBaseUrl();
    const request = buildUnregisterPushTokenRequest(w, token);
    unregisterRequest = request;
    await postUnregisterWithRetry(request, unregisterBaseUrl);
    didUnregister = true;
    console.log("[PushNotifications] Push token unregistered:", token);
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "Push token unregistered successfully",
      level: "info",
    });
  } catch (error) {
    if (isRetryablePushError(error)) {
      const token = unregisterToken ?? getStoredToken();
      const w = unregisterWallet ?? wallet ?? null;
      const request = unregisterRequest ?? (token && w ? buildUnregisterPushTokenRequest(w, token) : null);
      if (token && w && request) {
        queuePendingUnregister({
          id: `${w.address}:${token}`,
          token,
          address: w.address,
          baseUrl: unregisterBaseUrl,
          request,
          createdAt: Date.now(),
          attempts: 0,
        });
      }
      console.warn("[PushNotifications] Unregister deferred for retry:", error);
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "Push unregister deferred for retry",
        level: "warning",
        data: { hasToken: !!token, address: w?.address, baseUrl: unregisterBaseUrl },
      });
    } else {
      console.error("[PushNotifications] Unregister failed:", error);
      Sentry.captureException(error, {
        tags: { feature: "push-notifications", operation: "unregister" },
      });
    }
  } finally {
    console.log(
      didUnregister
        ? "[PushNotifications] Clearing stored push token after unregister"
        : "[PushNotifications] Clearing stored push token and keeping retry queue if needed",
    );
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
    if (!isPushEnabled() && !needsNetworkRetry) return;

    try {
      await flushPendingUnregisters();
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

function subscribeNetworkRecovery(): void {
  if (networkSubscription) return;

  let wasConnected = true;
  networkSubscription = Network.addNetworkStateListener(async (state) => {
    const isConnected = state.isConnected === true && state.isInternetReachable !== false;
    if (isConnected && !wasConnected && needsNetworkRetry && isAppInForeground()) {
      console.log("[PushNotifications] Network restored, retrying push cleanup/registration");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "Network restored — retrying push cleanup/registration",
        level: "info",
      });
      try {
        await flushPendingUnregisters();
        const wallet = await walletService.getWallet();
        if (!wallet) return;
        await registerPush(wallet);
      } catch (error) {
        console.error("[PushNotifications] Network recovery re-register failed:", error);
        Sentry.captureException(error, {
          tags: { feature: "push-notifications", operation: "network-recovery-register" },
        });
      }
    }
    wasConnected = isConnected;
  });
}

function subscribeKeychainRejectionHandler(): void {
  if (unhandledRejectionHandler) return;

  unhandledRejectionHandler = (event: any) => {
    const error = event?.reason ?? event;
    if (isKeychainAccessError(error)) {
      event?.preventDefault?.();
      needsNetworkRetry = true;
      console.warn("[PushNotifications] Suppressed unhandled keychain rejection, will retry on foreground");
      Sentry.addBreadcrumb({
        category: "push-notifications",
        message: "Suppressed unhandled keychain rejection",
        level: "warning",
      });
    }
  };

  if (typeof globalThis !== "undefined" && globalThis.addEventListener) {
    globalThis.addEventListener("unhandledrejection", unhandledRejectionHandler);
  }
}

export async function initPushNotifications(): Promise<void> {
  Sentry.addBreadcrumb({
    category: "push-notifications",
    message: "Initializing push notifications service",
    level: "info",
  });
  subscribeKeychainRejectionHandler();
  subscribePushReceived();
  subscribeAppStateForegroundReRegister();
  subscribeNetworkRecovery();
  void flushPendingUnregisters().catch((error) => {
    console.warn("[PushNotifications] Initial pending unregister flush failed:", error);
  });
}

export function cleanupPushNotifications(): void {
  pushReceivedSubscription?.remove();
  pushReceivedSubscription = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  networkSubscription?.remove();
  networkSubscription = null;
  needsNetworkRetry = false;
  if (unhandledRejectionHandler && typeof globalThis !== "undefined" && globalThis.removeEventListener) {
    globalThis.removeEventListener("unhandledrejection", unhandledRejectionHandler);
    unhandledRejectionHandler = null;
  }
}

export { isPushEnabled };
