import { isTabRoute, routeRequiresAuth } from "@/src/navigation/route-map";

export const STARTUP_HOME_ROUTE = "/";

export function resolveInitialHomeAnchor(targetRoute: string): {
  route: typeof STARTUP_HOME_ROUTE;
  pendingRoute: string | null;
} {
  return {
    route: STARTUP_HOME_ROUTE,
    pendingRoute: isStartupHomePath(targetRoute.split("?", 1)[0] ?? targetRoute)
      ? null
      : targetRoute,
  };
}

export type StartupRouteAction =
  | "none"
  | "wait_for_auth"
  | "wait_for_adult_prompt"
  | "auth_required"
  | "navigate_tab"
  | "push_screen";

export function isStartupHomePath(pathname: string): boolean {
  return (
    pathname === STARTUP_HOME_ROUTE ||
    pathname.endsWith("/(tabs)") ||
    pathname.endsWith("/(tabs)/") ||
    pathname.endsWith("/index")
  );
}

export function resolveStartupRouteAction(
  route: string | null,
  state: {
    isInitializing: boolean;
    isLoggedIn: boolean;
    hasSeenAdultPrompt: boolean;
  },
): StartupRouteAction {
  if (!route || isStartupHomePath(route.split("?", 1)[0] ?? route)) {
    return "none";
  }

  if (state.isInitializing) {
    return "wait_for_auth";
  }

  if (routeRequiresAuth(route)) {
    if (!state.isLoggedIn) {
      return "auth_required";
    }
    if (!state.hasSeenAdultPrompt) {
      return "wait_for_adult_prompt";
    }
  }

  return isTabRoute(route) ? "navigate_tab" : "push_screen";
}
