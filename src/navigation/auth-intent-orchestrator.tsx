import { useEffect, useRef } from "react";
import { usePathname, useRootNavigationState } from "expo-router";
import { InteractionManager } from "react-native";
import { useAuthStore } from "@/src/stores/auth-store";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { usePreferencesStore } from "@/src/stores/preferences-store";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { isProtectedEntryReady } from "./auth-entry-policy";
import { flushPendingRouteAfterAuth, isAuthRoute, isCompletedAuthExit } from "./auth-navigation";
import { hasCompletedLaunchThisRuntime } from "./startup-navigation-readiness";

export function AuthIntentOrchestrator({ isTransitioning = false }: { isTransitioning?: boolean } = {}) {
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const ready = useAuthStore(isProtectedEntryReady);
  const address = useAuthStore((state) => state.walletAddress);
  const adultReady = usePreferencesStore((state) => state.hasSeenAdultPrompt);
  const server = usePreferencesStore((state) => state.apiServer);
  const pending = useDeepLinkStore((state) => state.pendingRoute);
  const revision = useDeepLinkStore((state) => state.pendingRevision);
  const previous = useRef({ pathname, revision, address, server });

  useEffect(() => {
    const last = previous.current;
    previous.current = { pathname, revision, address, server };
    // Back, swipe dismissal, and the explicit close button share cancellation.
    if (last.server !== server || (last.address && last.address !== address) ||
      (isAuthRoute(last.pathname) && !isAuthRoute(pathname) && !isCompletedAuthExit(last.revision))) {
      useDeepLinkStore.getState().clearPendingRoute(last.revision);
    }
  }, [address, pathname, revision, server]);

  useEffect(() => {
    if (isTransitioning || !navigation?.key || !hasCompletedLaunchThisRuntime() || !ready ||
      !adultReady || !pending || isAuthRoute(pathname)) return;
    const session = authSessionCoordinator.current();
    const task = InteractionManager.runAfterInteractions(() => {
      if (!authSessionCoordinator.isCurrent(session) || usePreferencesStore.getState().apiServer !== server) {
        useDeepLinkStore.getState().clearPendingRoute(revision);
        return;
      }
      if (useDeepLinkStore.getState().pendingRevision !== revision) return;
      flushPendingRouteAfterAuth();
    });
    return () => task.cancel();
  }, [address, adultReady, isTransitioning, navigation?.key, pathname, pending, ready, revision, server]);

  return null;
}
