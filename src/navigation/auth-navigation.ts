import { useAuthStore } from "@/src/stores/auth-store";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { router } from "@/src/utils/guarded-router";

const AUTH_ROUTE_PREFIX = "/(auth)/";
const LOGGED_OUT_FALLBACK_ROUTE = "/(tabs)";

export function isAuthRoute(route: string): boolean {
  return route.startsWith(AUTH_ROUTE_PREFIX);
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

export function flushPendingRouteAfterAuth(): boolean {
  if (!useAuthStore.getState().isLoggedIn) {
    return false;
  }

  const pendingRoute = useDeepLinkStore.getState().consumePendingRoute();
  if (!pendingRoute) {
    return false;
  }

  requestAnimationFrame(() => {
    router.push(pendingRoute as any);
  });

  return true;
}
