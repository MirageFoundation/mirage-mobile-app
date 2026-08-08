import { useAuthStore } from "@/src/stores/auth-store";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { router } from "@/src/navigation/guarded-router";
import { isTabRoute } from "@/src/navigation/route-map";

// Legacy group-qualified form, kept for compatibility with any stored routes.
const AUTH_ROUTE_PREFIX = "/(auth)/";
const AUTH_ROUTE_PATHS = ["/login", "/username", "/recovery-phrase"] as const;
const LOGGED_OUT_FALLBACK_ROUTE = "/";

export function isAuthRoute(route: string): boolean {
  if (route.startsWith(AUTH_ROUTE_PREFIX)) return true;
  const pathname = route.split("?", 1)[0] ?? route;
  return (AUTH_ROUTE_PATHS as readonly string[]).includes(pathname);
}

export function resolveAuthNavigationTarget(route: string): string {
  if (isAuthRoute(route)) {
    return route;
  }

  if (!useAuthStore.getState().isLoggedIn) {
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
  const pendingRoute = useDeepLinkStore.getState().pendingRoute;
  if (!pendingRoute || !isAuthRoute(pendingRoute)) {
    return false;
  }

  useDeepLinkStore.getState().consumePendingRoute();
  router.push(pendingRoute as any);
  return true;
}

export function flushPendingRouteAfterAuth(): boolean {
  if (!useAuthStore.getState().isLoggedIn) {
    return false;
  }

  const pendingRoute = useDeepLinkStore.getState().consumePendingRoute();
  if (!pendingRoute) {
    return false;
  }

  if (isTabRoute(pendingRoute)) {
    router.navigate(pendingRoute as any);
  } else {
    router.push(pendingRoute as any);
  }

  return true;
}
