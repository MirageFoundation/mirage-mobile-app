import { useEffect, useRef, type ReactNode } from "react";
import { useIsFocused, useUnstableGlobalHref } from "expo-router";
import { useAuthStore } from "@/src/stores/auth-store";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { routeRequiresAuth, validatePendingRoute } from "./route-map";
import { replaceBypass } from "./guarded-router";
import { canEnterProtectedRoute } from "./auth-entry-policy";
import { hasCompletedLaunchThisRuntime } from "./startup-navigation-readiness";

/** Screen layout: the navigator stays mounted, but unauthorized pages never mount. */
export function ProtectedEntry({ children, screenName }: { children: ReactNode; screenName: string }) {
  const pathname = ["index", "(auth)", "(tabs)"].includes(screenName) ? "/" : `/${screenName}`;
  const href = useUnstableGlobalHref();
  const focused = useIsFocused();
  const initializing = useAuthStore((state) => state.isInitializing);
  const loggedIn = useAuthStore((state) => state.isLoggedIn);
  const ready = useAuthStore((state) => canEnterProtectedRoute(pathname, state));
  const protectedRoute = routeRequiresAuth(pathname);
  const target = validatePendingRoute(href);
  const revision = useDeepLinkStore((state) => state.pendingRevision);
  const redirected = useRef<string | null>(null);

  useEffect(() => {
    if (!focused || !protectedRoute || ready || initializing) {
      redirected.current = null;
      return;
    }
    if (!target || !routeRequiresAuth(target) || canEnterProtectedRoute(target, useAuthStore.getState())) return;
    if (useDeepLinkStore.getState().pendingRoute !== target) {
      useDeepLinkStore.getState().setPendingRoute(target);
    }
    if (!hasCompletedLaunchThisRuntime() || redirected.current === target) return;
    redirected.current = target;
    replaceBypass(loggedIn ? "/change-username" : "/login");
  }, [focused, initializing, loggedIn, protectedRoute, ready, revision, target]);

  return protectedRoute && !ready ? null : children;
}
