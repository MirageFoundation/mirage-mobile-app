import * as Linking from "expo-linking";
import ExpoShareIntentModule from "expo-share-intent/build/ExpoShareIntentModule";
import * as Sentry from "@sentry/react-native";
import { Alert } from "react-native";

import { useAuthStore, usePreferencesStore } from "@/src/stores";
import { useDeferredCampaignStore } from "@/src/stores/deferred-campaign-store";
import { storage } from "@/src/stores/mmkv-storage";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { setShareScheme } from "@/src/utils/share-scheme";
import { persistPendingShareIntent } from "@/src/navigation/pending-launch-intents";

import {
  isAuthRoute,
  navigateWithAuthGuard,
  resolveAuthNavigationTarget,
} from "./auth-navigation";
import { extractCampaignParams } from "./campaign-linking";
import { NOT_FOUND_ROUTE, resolveMirageUrl, validatePendingRoute } from "./route-map";
import { isProtectedEntryReady } from "./auth-entry-policy";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { normalizeDevelopmentLaunchPath } from "./development-launch-path";
import {
  navigateBypass,
  pushBypass,
  router,
} from "@/src/navigation/guarded-router";
import {
  resolveInitialHomeAnchor,
  resolveStartupRouteAction,
} from "@/src/navigation/startup-route-policy";

export function showLoginRequiredAlert(revision = useDeepLinkStore.getState().pendingRevision): void {
  if (revision !== useDeepLinkStore.getState().pendingRevision) return;
  const session = authSessionCoordinator.current();
  const isCurrent = () => authSessionCoordinator.isCurrent(session) &&
    revision === useDeepLinkStore.getState().pendingRevision;
  const cancel = () => {
    if (isCurrent()) useDeepLinkStore.getState().clearPendingRoute(revision);
  };
  Alert.alert(
    "Login Required",
    "Log in to view this content.",
    [
      { text: "Cancel", style: "cancel", onPress: cancel },
      {
        text: "Log In",
        onPress: () => {
          if (isCurrent()) router.push(useAuthStore.getState().isLoggedIn ? "/change-username" : "/login");
        },
      },
    ],
    { cancelable: true, onDismiss: cancel },
  );
}

function showAlreadyLoggedInForLoginAlert(route: string): void {
  const session = authSessionCoordinator.current();
  Alert.alert(
    "Already logged in",
    "You are already logged in. Please logout to login to another account.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          if (!authSessionCoordinator.isCurrent(session)) return;
          try {
            const logout = useAuthStore.getState().logout();
            const outgoing = authSessionCoordinator.current();
            await logout;
            if (authSessionCoordinator.isCurrent(outgoing) && !useAuthStore.getState().isLoggedIn) pushBypass(route as any);
          } catch (error) {
            Sentry.captureException(error, {
              tags: { feature: "deep-link", operation: "logout-for-login" },
              extra: { route },
            });
          }
        },
      },
    ],
  );
}

function showAlreadyLoggedInAlert(route: string): void {
  const session = authSessionCoordinator.current();
  Alert.alert(
    "Already logged in",
    "Please logout to create a new account.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          if (!authSessionCoordinator.isCurrent(session)) return;
          try {
            const logout = useAuthStore.getState().logout();
            const outgoing = authSessionCoordinator.current();
            await logout;
            if (authSessionCoordinator.isCurrent(outgoing) && !useAuthStore.getState().isLoggedIn) pushBypass(route as any);
          } catch (error) {
            Sentry.captureException(error, {
              tags: { feature: "deep-link", operation: "logout-for-signup" },
              extra: { route },
            });
          }
        },
      },
    ],
  );
}

function getAdditionalMirageHosts(): string[] {
  return [usePreferencesStore.getState().apiServer];
}

function captureDeferredCampaign(value: string): void {
  const fields = extractCampaignParams(value, getAdditionalMirageHosts());
  if (!fields) return;
  useDeferredCampaignStore.getState().captureFirstTouch(fields);
}

function resolveSelfRoute(route: string): string | null {
  if (route.split("?", 1)[0] !== "/user-following/__SELF__") return route;
  const walletAddress = useAuthStore.getState().walletAddress;
  if (!walletAddress) return route;
  return route.replace("__SELF__", encodeURIComponent(walletAddress));
}

const LAST_SHARE_PATH_KEY = "last-share-path";
const LAST_SHARE_PATH_AT_KEY = "last-share-path-at";
const REPEATED_SHARE_PATH_TTL_MS = 2 * 60_000;

function isShareIntentPath(path: string): boolean {
  return path.includes("dataUrl=") && path.includes("ShareKey");
}

function recoverInitialShareIntent(path: string): boolean {
  try {
    const result = ExpoShareIntentModule?.getShareIntent(path);
    const pending = persistPendingShareIntent(
      result,
      "initial-native-intent",
      path,
    );
    if (pending) {
      return true;
    }

    clearLastSharePath(path);
    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Ignoring initial share launch path without payload",
      data: { path: summarizeSharePath(path), hasResult: !!result },
      level: "info",
    });
    return false;
  } catch (error) {
    clearLastSharePath(path);
    Sentry.captureException(error, {
      tags: { feature: "share-intent", operation: "initial-native-intent" },
      extra: { path: summarizeSharePath(path) },
    });
    return false;
  }
}

function getRepeatedSharePathAgeMs(path: string): number | null {
  const lastPath = storage.getString(LAST_SHARE_PATH_KEY);
  const lastHandledAt = storage.getNumber(LAST_SHARE_PATH_AT_KEY) ?? 0;

  if (lastPath !== path || lastHandledAt <= 0) return null;

  return Date.now() - lastHandledAt;
}

export function getRecentSharePathAgeMs(): number | null {
  const lastHandledAt = storage.getNumber(LAST_SHARE_PATH_AT_KEY) ?? 0;
  if (lastHandledAt <= 0) return null;
  return Date.now() - lastHandledAt;
}

export function isRecentSharePath(withinMs = 10_000): boolean {
  const age = getRecentSharePathAgeMs();
  return age !== null && age >= 0 && age < withinMs;
}

export function getLastSharePath(): string | null {
  return storage.getString(LAST_SHARE_PATH_KEY) ?? null;
}

export function clearLastSharePath(expectedPath?: string | null): void {
  if (expectedPath) {
    const lastPath = storage.getString(LAST_SHARE_PATH_KEY);
    if (lastPath && lastPath !== expectedPath) return;
  }

  storage.remove(LAST_SHARE_PATH_KEY);
  storage.remove(LAST_SHARE_PATH_AT_KEY);
}

function shouldSkipRepeatedSharePath(path: string): boolean {
  const ageMs = getRepeatedSharePathAgeMs(path);
  return ageMs !== null && ageMs < REPEATED_SHARE_PATH_TTL_MS;
}

function summarizeSharePath(path: string): string {
  return path.length > 160 ? `${path.slice(0, 157)}...` : path;
}

function rememberSharePath(path: string): void {
  storage.set(LAST_SHARE_PATH_KEY, path);
  storage.set(LAST_SHARE_PATH_AT_KEY, Date.now());
}

export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  if (__DEV__) path = normalizeDevelopmentLaunchPath(path);
  captureDeferredCampaign(path);

  const scheme = path.match(/^([^:]+):\/\//)?.[1];
  if (scheme) {
    setShareScheme(scheme);
  }

  if (isShareIntentPath(path)) {
    const repeatedSharePathAgeMs = getRepeatedSharePathAgeMs(path);

    if (initial) {
      if (!recoverInitialShareIntent(path)) {
        return "/";
      }
      rememberSharePath(path);
      return "/";
    }

    if (!initial && shouldSkipRepeatedSharePath(path)) {
      Sentry.addBreadcrumb({
        category: "share-intent",
        message: "Routing repeated share launch path to create",
        data: {
          initial,
          ageMs: repeatedSharePathAgeMs,
          path: summarizeSharePath(path),
        },
        level: "info",
      });
      return "/create";
    }

    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Routing share launch path to create",
      data: {
        initial,
        repeatedSharePathAgeMs,
        path: summarizeSharePath(path),
      },
      level: "info",
    });

    rememberSharePath(path);
    return "/create";
  }

  const match = resolveMirageUrl(path, getAdditionalMirageHosts());
  if (!match || match.type === "notFound") {
    return NOT_FOUND_ROUTE;
  }

  // Valid cold-start targets enter through Home. Auth is resolved there first, and
  // only then is this route pushed/navigated by LaunchRouteOrchestrator. This
  // gives every launch target a deterministic Home back destination.
  if (initial) {
    const anchor = resolveInitialHomeAnchor(match.route);
    if (anchor.pendingRoute) {
      useDeepLinkStore.getState().setPendingRoute(anchor.pendingRoute);
    }
    return anchor.route;
  }

  const resolvedRoute = resolveSelfRoute(match.route);
  if (!resolvedRoute) {
    return NOT_FOUND_ROUTE;
  }

  if (!match.requiresAuth) {
    if (match.type === "signup" && useAuthStore.getState().isLoggedIn) {
      showAlreadyLoggedInAlert(resolvedRoute);
      return "/";
    }
    if (match.type === "login" && useAuthStore.getState().isLoggedIn) {
      showAlreadyLoggedInForLoginAlert(resolvedRoute);
      return "/";
    }
    return resolvedRoute;
  }

  const target = resolveAuthNavigationTarget(resolvedRoute);
  if (target !== resolvedRoute) {
    const revision = useDeepLinkStore.getState().pendingRevision;
    setTimeout(() => showLoginRequiredAlert(revision), 500);
    return "/";
  }

  return target;
}

export type PendingLaunchRouteResult =
  | "none"
  | "dispatched"
  | "auth_required"
  | "waiting";

export function flushPendingLaunchRoute(state: {
  isInitializing: boolean;
  isLoggedIn: boolean;
  hasSeenAdultPrompt: boolean;
}): PendingLaunchRouteResult {
  const rawRoute = useDeepLinkStore.getState().pendingRoute;
  const pendingRoute = rawRoute && validatePendingRoute(rawRoute);
  if (rawRoute && !pendingRoute) {
    useDeepLinkStore.getState().consumePendingRoute();
    return "none";
  }
  const action = resolveStartupRouteAction(pendingRoute, state);

  if (action === "none") {
    if (pendingRoute) useDeepLinkStore.getState().consumePendingRoute();
    return "none";
  }
  if (action === "wait_for_auth" || action === "wait_for_adult_prompt") {
    return "waiting";
  }
  if (action === "auth_required") {
    showLoginRequiredAlert();
    return "auth_required";
  }

  const route = resolveSelfRoute(pendingRoute!);
  if (!route) return "waiting";
  useDeepLinkStore.getState().consumePendingRoute();

  if (state.isLoggedIn && isAuthRoute(route)) {
    if ((route.split("?", 1)[0] ?? route) === "/login") {
      showAlreadyLoggedInForLoginAlert(route);
    } else if ((route.split("?", 1)[0] ?? route) === "/username") {
      showAlreadyLoggedInAlert(route);
    } else {
      pushBypass(route as any);
    }
    return "dispatched";
  }

  if (action === "navigate_tab") {
    navigateBypass(route as any);
  } else {
    pushBypass(route as any);
  }
  return "dispatched";
}

export async function handleMirageLink(url: string): Promise<boolean> {
  captureDeferredCampaign(url);

  const match = resolveMirageUrl(url, getAdditionalMirageHosts());
  if (!match) {
    return false;
  }

  const resolvedRoute = resolveSelfRoute(match.route);
  if (!resolvedRoute) {
    navigateWithAuthGuard(NOT_FOUND_ROUTE);
    return true;
  }

  if (match.type === "signup" && useAuthStore.getState().isLoggedIn) {
    showAlreadyLoggedInAlert(resolvedRoute);
    return true;
  }

  if (match.type === "login" && useAuthStore.getState().isLoggedIn) {
    showAlreadyLoggedInForLoginAlert(resolvedRoute);
    return true;
  }

  if (match.requiresAuth && !isProtectedEntryReady(useAuthStore.getState())) {
    resolveAuthNavigationTarget(resolvedRoute);
    showLoginRequiredAlert();
    return true;
  }

  navigateWithAuthGuard(resolvedRoute);

  return true;
}

export function openUrlOrInternal(url: string): void {
  const fullUrl =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;

  handleMirageLink(fullUrl).then((handled) => {
    if (!handled) {
      Linking.openURL(fullUrl).catch((error) => {
        Sentry.captureException(error, {
          tags: { feature: "links", operation: "open-url" },
          extra: { url: fullUrl },
        });
      });
    }
  });
}
