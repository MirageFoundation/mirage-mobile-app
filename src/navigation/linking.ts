import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";
import { Alert } from "react-native";

import { getRootPostId } from "@/src/api/read/endpoints/posts";
import { useAuthStore, usePreferencesStore } from "@/src/stores";
import { storage } from "@/src/stores/mmkv-storage";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { setShareScheme } from "@/src/utils/share-scheme";

import {
  isAuthRoute,
  navigateWithAuthGuard,
  resolveAuthNavigationTarget,
} from "./auth-navigation";
import { isAppRoute, resolveMirageUrl } from "./route-map";
import { router } from "@/src/utils/guarded-router";

function showLoginRequiredAlert(): void {
  Alert.alert(
    "Login Required",
    "Log in to view this content.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log In",
        onPress: () => router.push("/(auth)/login" as any),
      },
    ],
  );
}

function showAlreadyLoggedInForLoginAlert(route: string): void {
  Alert.alert(
    "Already logged in",
    "You are already logged in. Please logout to login to another account.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await useAuthStore.getState().logout();
            setTimeout(() => router.push(route as any), 500);
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
  const isInvite = route.includes("invite=");
  Alert.alert(
    "Already logged in",
    isInvite
      ? "Please logout to create a new account using the invite code."
      : "Please logout to create a new account using the referral link.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          try {
            await useAuthStore.getState().logout();
            setTimeout(() => router.push(route as any), 500);
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

function resolveRootPostForComment(commentId: string) {
  getRootPostId({ comment_id: commentId })
    .then((response) => {
      if (response.root_post_id && response.root_post_id !== commentId) {
        navigateWithAuthGuard(
          `/post/${response.root_post_id}?highlight=${commentId}`,
          "replace",
        );
      }
    })
    .catch((error) => {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Failed to resolve root post",
        data: { commentId, error: String(error) },
        level: "warning",
      });
    });
}

function resolveSelfRoute(route: string): string | null {
  if (!route.includes("__SELF__")) return route;
  const walletAddress = useAuthStore.getState().walletAddress;
  if (!walletAddress) return null;
  return route.replace("__SELF__", walletAddress);
}

function isTabRoute(route: string): boolean {
  return route.startsWith("/(tabs)");
}

const LAST_SHARE_PATH_KEY = "last-share-path";
const LAST_SHARE_PATH_AT_KEY = "last-share-path-at";
const REPEATED_SHARE_PATH_TTL_MS = 2 * 60_000;

function isShareIntentPath(path: string): boolean {
  return path.includes("dataUrl=") && path.includes("ShareKey");
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
  const scheme = path.match(/^([^:]+):\/\//)?.[1];
  if (scheme) {
    setShareScheme(scheme);
  }

  if (isShareIntentPath(path)) {
    const repeatedSharePathAgeMs = getRepeatedSharePathAgeMs(path);

    if (shouldSkipRepeatedSharePath(path)) {
      Sentry.addBreadcrumb({
        category: "share-intent",
        message: "Skipping repeated stale share launch path",
        data: {
          initial,
          ageMs: repeatedSharePathAgeMs,
          path: summarizeSharePath(path),
        },
        level: "info",
      });
      return "/(tabs)";
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
    return "/(tabs)/create";
  }

  if (isAppRoute(path)) {
    if (initial && isAuthRoute(path)) {
      useDeepLinkStore.getState().setPendingRoute(path);
      return "/(tabs)";
    }
    return path;
  }

  const match = resolveMirageUrl(path, getAdditionalMirageHosts());
  if (!match) {
    return "";
  }

  const resolvedRoute = resolveSelfRoute(match.route);
  if (!resolvedRoute) {
    return "";
  }

  if (!match.requiresAuth) {
    if (match.type === "signup" && useAuthStore.getState().isLoggedIn) {
      showAlreadyLoggedInAlert(resolvedRoute);
      return "/(tabs)";
    }
    if (match.type === "login" && useAuthStore.getState().isLoggedIn) {
      showAlreadyLoggedInForLoginAlert(resolvedRoute);
      return "/(tabs)";
    }
    if (initial && isAuthRoute(resolvedRoute)) {
      useDeepLinkStore.getState().setPendingRoute(resolvedRoute);
      return "/(tabs)";
    }
    return resolvedRoute;
  }

  const target = resolveAuthNavigationTarget(resolvedRoute);
  if (target !== resolvedRoute) {
    setTimeout(() => showLoginRequiredAlert(), 500);
    return "";
  }

  if (initial && !isTabRoute(target)) {
    useDeepLinkStore.getState().setPendingRoute(target);
    return "/(tabs)";
  }

  return target;
}

export async function handleMirageLink(url: string): Promise<boolean> {
  if (isAppRoute(url)) {
    navigateWithAuthGuard(url);
    return true;
  }

  const match = resolveMirageUrl(url, getAdditionalMirageHosts());
  if (!match) {
    return false;
  }

  const resolvedRoute = resolveSelfRoute(match.route);
  if (!resolvedRoute) {
    return false;
  }

  if (match.type === "signup" && useAuthStore.getState().isLoggedIn) {
    showAlreadyLoggedInAlert(resolvedRoute);
    return true;
  }

  if (match.type === "login" && useAuthStore.getState().isLoggedIn) {
    showAlreadyLoggedInForLoginAlert(resolvedRoute);
    return true;
  }

  if (match.requiresAuth && !useAuthStore.getState().isLoggedIn) {
    resolveAuthNavigationTarget(resolvedRoute);
    showLoginRequiredAlert();
    return true;
  }

  navigateWithAuthGuard(resolvedRoute);

  if (match.type === "post" && match.resourceId) {
    resolveRootPostForComment(match.resourceId);
  }

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
