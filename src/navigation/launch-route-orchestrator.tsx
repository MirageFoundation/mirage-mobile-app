import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import * as Sentry from "@sentry/react-native";

import { useAuthStore } from "@/src/stores/auth-store";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { usePreferencesStore } from "@/src/stores/preferences-store";
import {
  isInboxNotificationNavigationActive,
  isInboxNotificationNavigationPending,
  markShareIntentNavigationActive,
} from "@/src/services/inbox-notifications";
import { getPendingShareIntent } from "@/src/navigation/pending-launch-intents";
import {
  flushPendingLaunchRoute,
} from "@/src/navigation/linking";
import {
  navigateBypass,
  replaceBypass,
} from "@/src/navigation/guarded-router";
import {
  isStartupHomePath,
  STARTUP_HOME_ROUTE,
} from "@/src/navigation/startup-route-policy";
import { signalStartupHomeReady } from "@/src/navigation/startup-navigation-readiness";

/**
 * Establishes one deterministic cold-start history:
 *
 *   auth resolves -> Home commits -> launch target is navigated
 *
 * Initial system URLs are captured by linking.ts and rewritten to Home. This
 * component also repairs any route that bypasses that redirect. Notification
 * navigation waits for the Home-ready signal and owns its own final target.
 */
export function LaunchRouteOrchestrator() {
  const pathname = usePathname();
  const { hasShareIntent } = useShareIntentContext();
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const hasSeenAdultPrompt = usePreferencesStore(
    (state) => state.hasSeenAdultPrompt,
  );
  const pendingRoute = useDeepLinkStore((state) => state.pendingRoute);

  const homeAnchorEstablishedRef = useRef(false);
  const initialLaunchHandledRef = useRef(false);
  const authRequiredPresentedRef = useRef(false);
  const shareNavigationDispatchedRef = useRef(false);
  const initialShareIntentRef = useRef(hasShareIntent);

  useEffect(() => {
    if (isInitializing || homeAnchorEstablishedRef.current || !pathname) return;

    if (!isStartupHomePath(pathname)) {
      const notificationOwnsRoute = isInboxNotificationNavigationPending();
      const shareOwnsRoute =
        hasShareIntent || initialShareIntentRef.current || !!getPendingShareIntent();

      if (!pendingRoute && !notificationOwnsRoute && !shareOwnsRoute) {
        useDeepLinkStore.getState().setPendingRoute(pathname);
      }

      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Anchoring cold start on Home before launch target",
        level: "info",
        data: {
          pathname,
          hasPendingRoute: !!pendingRoute,
          notificationOwnsRoute,
          shareOwnsRoute,
        },
      });
      replaceBypass(STARTUP_HOME_ROUTE);
      return;
    }

    homeAnchorEstablishedRef.current = true;
    signalStartupHomeReady();
    Sentry.addBreadcrumb({
      category: "navigation",
      message: "Startup auth resolved and Home committed",
      level: "info",
      data: { isLoggedIn },
    });
  }, [hasShareIntent, isInitializing, isLoggedIn, pathname, pendingRoute]);

  useEffect(() => {
    if (
      !homeAnchorEstablishedRef.current ||
      initialLaunchHandledRef.current ||
      isInitializing
    ) {
      return;
    }

    if (isInboxNotificationNavigationPending()) {
      initialLaunchHandledRef.current = true;
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Notification owns post-Home startup navigation",
        level: "info",
      });
      return;
    }

    if (pendingRoute) {
      const result = flushPendingLaunchRoute({
        isInitializing,
        isLoggedIn,
        hasSeenAdultPrompt,
      });
      if (result === "waiting") return;
      if (result === "auth_required") {
        authRequiredPresentedRef.current = true;
      }
      initialLaunchHandledRef.current = true;
      return;
    }

    const hasInitialShareIntent =
      initialShareIntentRef.current || hasShareIntent || !!getPendingShareIntent();
    if (hasInitialShareIntent) {
      markShareIntentNavigationActive("post-home-initial-share-intent");
      shareNavigationDispatchedRef.current = true;
      navigateBypass("/create");
    }

    initialLaunchHandledRef.current = true;
  }, [
    hasSeenAdultPrompt,
    hasShareIntent,
    isInitializing,
    isLoggedIn,
    pendingRoute,
  ]);

  // A protected cold-start route remains pending while logged out. Dispatch it
  // only after the same auth and onboarding gates have become ready.
  useEffect(() => {
    if (
      !homeAnchorEstablishedRef.current ||
      !initialLaunchHandledRef.current ||
      !authRequiredPresentedRef.current ||
      !pendingRoute ||
      !isLoggedIn ||
      !hasSeenAdultPrompt
    ) {
      return;
    }

    const result = flushPendingLaunchRoute({
      isInitializing,
      isLoggedIn,
      hasSeenAdultPrompt,
    });
    if (result === "dispatched" || result === "none") {
      authRequiredPresentedRef.current = false;
    }
  }, [
    hasSeenAdultPrompt,
    isInitializing,
    isLoggedIn,
    pendingRoute,
  ]);

  // Share intents received after startup use the already-established Home
  // anchor. They navigate the tab history instead of replacing its root.
  useEffect(() => {
    if (!hasShareIntent) {
      shareNavigationDispatchedRef.current = false;
      return;
    }
    if (
      !homeAnchorEstablishedRef.current ||
      !initialLaunchHandledRef.current ||
      shareNavigationDispatchedRef.current ||
      isInboxNotificationNavigationActive() ||
      pendingRoute
    ) {
      return;
    }
    if (pathname.endsWith("/create")) {
      shareNavigationDispatchedRef.current = true;
      return;
    }

    markShareIntentNavigationActive("post-home-share-intent");
    shareNavigationDispatchedRef.current = true;
    navigateBypass("/create");
  }, [hasShareIntent, pathname, pendingRoute]);

  return null;
}
