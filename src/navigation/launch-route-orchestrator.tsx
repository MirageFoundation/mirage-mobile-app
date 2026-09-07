import { useEffect, useRef } from "react";
import { usePathname, useUnstableGlobalHref } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import * as Sentry from "@sentry/react-native";

import { selectAuthSessionStatus, useAuthStore } from "@/src/stores/auth-store";
import { AUTH_RECOVERY_ROUTE } from "@/src/navigation/auth-flow-policy";
import { isProtectedEntryReady } from "@/src/navigation/auth-entry-policy";
import { validatePendingRoute } from "@/src/navigation/route-map";
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
import {
  hasCompletedLaunchThisRuntime,
  markLaunchCompletedThisRuntime,
  signalStartupHomeReady,
} from "@/src/navigation/startup-navigation-readiness";

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
  const href = useUnstableGlobalHref();
  const { hasShareIntent } = useShareIntentContext();
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const isLoggedIn = useAuthStore(isProtectedEntryReady);
  const sessionStatus = useAuthStore(selectAuthSessionStatus);
  const hasSeenAdultPrompt = usePreferencesStore(
    (state) => state.hasSeenAdultPrompt,
  );
  const pendingRoute = useDeepLinkStore((state) => state.pendingRoute);

  const homeAnchorEstablishedRef = useRef(false);
  const startupHomeReadySignaledRef = useRef(false);
  const initialLaunchHandledRef = useRef(false);
  const shareNavigationDispatchedRef = useRef(false);
  const initialShareIntentRef = useRef(hasShareIntent);

  useEffect(() => {
    if (!pathname) return;

    // A layout remount in the same JS runtime is not process death. Re-anchoring
    // Home would drop inner-screen state after a short background (BUG-007).
    if (hasCompletedLaunchThisRuntime()) {
      homeAnchorEstablishedRef.current = true;
      initialLaunchHandledRef.current = true;
      if (!startupHomeReadySignaledRef.current) {
        startupHomeReadySignaledRef.current = true;
        signalStartupHomeReady();
      }
      return;
    }

    // Record Home as soon as it mounts, even while auth is still resolving.
    // Otherwise a quick in-app push can be mistaken for a cold-start target
    // once initialization finishes and get replaced by Home.
    if (!homeAnchorEstablishedRef.current && isStartupHomePath(pathname)) {
      homeAnchorEstablishedRef.current = true;
    }

    if (isInitializing) return;

    if (!homeAnchorEstablishedRef.current) {
      const notificationOwnsRoute = isInboxNotificationNavigationPending();
      const shareOwnsRoute =
        hasShareIntent || initialShareIntentRef.current || !!getPendingShareIntent();

      if (!useDeepLinkStore.getState().pendingRoute && !notificationOwnsRoute && !shareOwnsRoute) {
        useDeepLinkStore.getState().setPendingRoute(validatePendingRoute(href));
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

    if (startupHomeReadySignaledRef.current) return;

    startupHomeReadySignaledRef.current = true;
    signalStartupHomeReady();
    Sentry.addBreadcrumb({
      category: "navigation",
      message: "Startup auth resolved and Home committed",
      level: "info",
      data: { isLoggedIn },
    });
  }, [hasShareIntent, href, isInitializing, isLoggedIn, pathname, pendingRoute]);

  useEffect(() => {
    if (
      !homeAnchorEstablishedRef.current ||
      initialLaunchHandledRef.current ||
      isInitializing
    ) {
      return;
    }

    if (sessionStatus === "pending_signup") {
      initialLaunchHandledRef.current = true;
      markLaunchCompletedThisRuntime();
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Resuming pending signup on recovery phrase",
        level: "info",
      });
      navigateBypass(AUTH_RECOVERY_ROUTE);
      return;
    }

    if (isInboxNotificationNavigationPending()) {
      initialLaunchHandledRef.current = true;
      markLaunchCompletedThisRuntime();
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
      initialLaunchHandledRef.current = true;
      markLaunchCompletedThisRuntime();
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
    markLaunchCompletedThisRuntime();
  }, [
    hasSeenAdultPrompt,
    hasShareIntent,
    isInitializing,
    isLoggedIn,
    pendingRoute,
    sessionStatus,
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
