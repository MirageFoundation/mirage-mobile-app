import { useAuthStore } from "@/src/stores/auth-store";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { navigateBypass, pushBypass, replaceBypass, router } from "@/src/navigation/guarded-router";
import { isTabRoute, routeRequiresAuth, validatePendingRoute, NOT_FOUND_ROUTE } from "@/src/navigation/route-map";
import { AUTH_EXIT_ROUTE } from "@/src/navigation/auth-flow-policy";
import { canEnterProtectedRoute, isProtectedEntryReady } from "./auth-entry-policy";
import { authSessionCoordinator, type AuthSessionToken } from "@/src/services/auth-session-coordinator";

let completedExit: { revision: number; session: AuthSessionToken } | null = null;

export function isCompletedAuthExit(revision: number): boolean {
  return completedExit?.revision === revision && authSessionCoordinator.isCurrent(completedExit.session);
}

const AUTH_ROUTE_PATHS = ["/login", "/username", "/recovery-phrase"] as const;
const LOGGED_OUT_FALLBACK_ROUTE = "/";

export function isAuthRoute(route: string): boolean {
  const pathname = validatePendingRoute(route)?.split("?", 1)[0] ?? "";
  return (AUTH_ROUTE_PATHS as readonly string[]).includes(pathname);
}

/**
 * Leave the (auth) modal after login or signup.
 *
 * `dismissAll()` / `dismissTo()` only unwind the nearest Stack — the (auth)
 * group's own stack, whose initial route is username. That dumps a finished
 * session back onto registration (BUG-004). `replace("/")` exits the modal.
 */
export function exitAuthModal(): void {
  completedExit = {
    revision: useDeepLinkStore.getState().pendingRevision,
    session: authSessionCoordinator.current(),
  };
  replaceBypass(AUTH_EXIT_ROUTE as any);
}

export function resolveAuthNavigationTarget(route: string): string {
  if (route === NOT_FOUND_ROUTE) return route;
  const safeRoute = validatePendingRoute(route);
  if (!safeRoute) return NOT_FOUND_ROUTE;
  route = safeRoute;
  if (!routeRequiresAuth(route)) {
    return route;
  }

  if (!canEnterProtectedRoute(route, useAuthStore.getState())) {
    useDeepLinkStore.getState().setPendingRoute(route);
    return LOGGED_OUT_FALLBACK_ROUTE;
  }

  return route;
}

export function navigateWithAuthGuard(
  route: string,
  method: "push" | "replace" | "navigate" = "push",
): string {
  const target = resolveAuthNavigationTarget(route);
  router[method](target as any);
  return target;
}

export function flushPendingAuthRoute(): boolean {
  const rawRoute = useDeepLinkStore.getState().pendingRoute;
  const pendingRoute = rawRoute && validatePendingRoute(rawRoute);
  if (!pendingRoute || !isAuthRoute(pendingRoute)) {
    return false;
  }

  useDeepLinkStore.getState().consumePendingRoute();
  router.push(pendingRoute as any);
  return true;
}

export function flushPendingRouteAfterAuth(): boolean {
  if (!isProtectedEntryReady(useAuthStore.getState())) {
    return false;
  }

  const rawRoute = useDeepLinkStore.getState().pendingRoute;
  let pendingRoute = rawRoute && validatePendingRoute(rawRoute);
  if (!pendingRoute || isAuthRoute(pendingRoute)) {
    if (rawRoute) useDeepLinkStore.getState().consumePendingRoute();
    return false;
  }

  if (pendingRoute.split("?", 1)[0] === "/user-following/__SELF__") {
    const address = useAuthStore.getState().walletAddress;
    if (!address) return false;
    pendingRoute = pendingRoute.replace("__SELF__", encodeURIComponent(address));
  }
  useDeepLinkStore.getState().consumePendingRoute();

  if (isTabRoute(pendingRoute)) {
    navigateBypass(pendingRoute as any);
  } else {
    pushBypass(pendingRoute as any);
  }

  return true;
}
