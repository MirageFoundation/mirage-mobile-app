import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

const MIRAGE_HOSTS = ["mirage.talk", "mirage.vote"] as const;
const MIRAGE_SCHEME_PREFIX = "mirage";
// Group-free canonical paths: the route tree is Slot (root) -> (app) Stack ->
// (tabs) Tabs, and hrefs resolve without group segments, so emitted routes
// stay stable even if groups are reorganized again.
const TAB_HOME_ROUTE = "/";

const TAB_ROUTE_PATHS = [
  "/",
  "/following",
  "/inbox",
  "/profile",
  "/create",
] as const;

const KNOWN_APP_ROUTE_PREFIXES = [
  "/(auth)/",
  "/(tabs)",
  "/p/",
  "/post/",
  "/user/",
  "/topic/",
  "/search",
  "/topics",
  "/settings",
  "/subscription",
  "/agents",
  "/invite-and-earn",
  "/referrals",
  "/blocked-list",
  "/user-following/",
] as const;

export type MirageRouteType =
  | "post"
  | "user"
  | "topic"
  | "search"
  | "topics"
  | "settings"
  | "subscription"
  | "inbox"
  | "signup"
  | "home"
  | "following"
  | "profile"
  | "agents"
  | "create"
  | "blocks"
  | "referrals"
  | "follows"
  | "login";

export interface MirageRouteMatch {
  type: MirageRouteType;
  hostname: string;
  route: string;
  requiresAuth: boolean;
  resourceId?: string;
}

function splitPathAndSearch(value: string): {
  pathname: string;
  search: string;
} {
  const withoutHash = value.split("#", 1)[0] ?? value;
  const [rawPathname, rawSearch = ""] = withoutHash.split("?", 2);
  const pathname = rawPathname.startsWith("/")
    ? rawPathname
    : `/${rawPathname}`;

  return {
    pathname,
    search: rawSearch ? `?${rawSearch}` : "",
  };
}

function withDefaultSearchParam(
  search: string,
  key: string,
  value: string,
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!params.has(key)) {
    params.set(key, value);
  }
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function getMirageHosts(additionalHosts: string[] = []): string[] {
  return [...new Set([...MIRAGE_HOSTS, ...additionalHosts.filter(Boolean)])];
}

export function isMirageHost(
  hostname: string,
  additionalHosts: string[] = [],
): boolean {
  return getMirageHosts(additionalHosts).includes(hostname);
}

export function isMirageScheme(scheme: string): boolean {
  return scheme.toLowerCase().startsWith(MIRAGE_SCHEME_PREFIX);
}

function matchesAppRoutePrefix(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) {
    return false;
  }

  if (prefix.endsWith("/")) {
    const rest = pathname.slice(prefix.length);
    return rest.length > 0 && !rest.startsWith("/");
  }

  if (pathname.length === prefix.length) {
    return true;
  }

  return pathname.charAt(prefix.length) === "/";
}

export function isAppRoute(path: string): boolean {
  const { pathname } = splitPathAndSearch(path);

  return KNOWN_APP_ROUTE_PREFIXES.some((prefix) =>
    matchesAppRoutePrefix(pathname, prefix),
  );
}

/** Matches the tab navigator's canonical paths (legacy group form included). */
export function isTabRoute(route: string): boolean {
  const { pathname } = splitPathAndSearch(route);
  if (pathname.startsWith("/(tabs)")) return true;
  return (TAB_ROUTE_PATHS as readonly string[]).includes(pathname);
}

/**
 * Whether an already-resolved in-app route needs an authenticated wallet.
 * Startup linking uses this only after wallet initialization has completed.
 */
export function routeRequiresAuth(route: string): boolean {
  const { pathname } = splitPathAndSearch(route);
  if (pathname === TAB_HOME_ROUTE) return false;
  if (pathname.startsWith("/post/") || pathname.startsWith("/p/")) return false;
  if (pathname.startsWith("/(auth)/")) return false;
  return ![
    "/login",
    "/username",
    "/recovery-phrase",
  ].includes(pathname);
}

export function mapMiragePathToRoute(
  pathname: string,
  search: string = "",
): MirageRouteMatch | null {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return {
      type: "home",
      hostname: "",
      route: TAB_HOME_ROUTE,
      requiresAuth: true,
    };
  }

  const prefix = segments[0];

  if (segments.length >= 2) {
    const resourceId = segments[1];

    if (prefix === "p" || prefix === "c" || prefix === "comment") {
      const postSearch = prefix === "p"
        ? search || ""
        : withDefaultSearchParam(search, "depth", "5");
      // Public URLs use /p/<id>, but the canonical in-app screen is
      // /post/[id] (the /p/ route file is only a Redirect alias for raw
      // external paths). Emit the canonical route directly.
      return {
        type: "post",
        hostname: "",
        route: `/post/${resourceId}${postSearch}`,
        requiresAuth: false,
        resourceId,
      };
    }

    if (prefix === "u" || prefix === "user") {
      return {
        type: "user",
        hostname: "",
        route: `/user/${resourceId}${search || ""}`,
        requiresAuth: true,
        resourceId,
      };
    }

    if (prefix === "t") {
      return {
        type: "topic",
        hostname: "",
        route: `/topic/${resourceId}`,
        requiresAuth: true,
        resourceId,
      };
    }
  }

  if (prefix === "signup" || prefix === "create_account") {
    const params = new URLSearchParams(search);
    const invite = params.get("invite");
    const ref = params.get("ref");
    const suffix = invite
      ? `?invite=${encodeURIComponent(invite)}`
      : ref
        ? `?ref=${encodeURIComponent(ref)}`
        : "";

    return {
      type: "signup",
      hostname: "",
      route: `/username${suffix}`,
      requiresAuth: false,
      resourceId: invite ?? ref ?? undefined,
    };
  }

  if (prefix === "home") {
    return {
      type: "home",
      hostname: "",
      route: TAB_HOME_ROUTE,
      requiresAuth: true,
    };
  }

  if (prefix === "following") {
    return {
      type: "following",
      hostname: "",
      route: "/following",
      requiresAuth: true,
    };
  }

  if (prefix === "inbox") {
    return {
      type: "inbox",
      hostname: "",
      route: "/inbox",
      requiresAuth: true,
    };
  }

  if (prefix === "profile") {
    return {
      type: "profile",
      hostname: "",
      route: `/profile${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "search") {
    return {
      type: "search",
      hostname: "",
      route: `/search${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "topics") {
    return {
      type: "topics",
      hostname: "",
      route: "/topics",
      requiresAuth: true,
    };
  }

  if (prefix === "settings") {
    return {
      type: "settings",
      hostname: "",
      route: "/settings",
      requiresAuth: true,
    };
  }

  if (prefix === "subscription") {
    if (Platform.OS === "ios") return null;
    return {
      type: "subscription",
      hostname: "",
      route: "/subscription",
      requiresAuth: true,
    };
  }

  if (prefix === "agents") {
    return {
      type: "agents",
      hostname: "",
      route: "/agents",
      requiresAuth: true,
    };
  }

  if (prefix === "create_post") {
    return {
      type: "create",
      hostname: "",
      route: "/create",
      requiresAuth: true,
    };
  }

  if (prefix === "blocks") {
    return {
      type: "blocks",
      hostname: "",
      route: "/blocked-list",
      requiresAuth: true,
    };
  }

  if (prefix === "follows") {
    return {
      type: "follows",
      hostname: "",
      route: "/user-following/__SELF__",
      requiresAuth: true,
    };
  }

  if (prefix === "referrals") {
    return {
      type: "referrals",
      hostname: "",
      route: "/referrals",
      requiresAuth: true,
    };
  }

  if (prefix === "login") {
    return {
      type: "login",
      hostname: "",
      route: "/login",
      requiresAuth: false,
    };
  }

  return null;
}

export function resolveMirageUrl(
  value: string,
  additionalHosts: string[] = [],
): MirageRouteMatch | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  try {
    const url = new URL(normalizedValue);
    const scheme = url.protocol.replace(/:$/, "");

    if (isMirageScheme(scheme)) {
      const logicalPath = `/${url.hostname}${url.pathname}`;
      const match = mapMiragePathToRoute(logicalPath, url.search);
      return match
        ? {
            ...match,
            hostname: url.hostname,
          }
        : null;
    }

    if (!isMirageHost(url.hostname, additionalHosts)) {
      return null;
    }

    const match = mapMiragePathToRoute(url.pathname, url.search);
    return match
      ? {
          ...match,
          hostname: url.hostname,
        }
      : null;
  } catch (error) {
    Sentry.addBreadcrumb({
      category: "deep-link",
      message: "URL parse failed, falling back to path split",
      data: { rawValue: normalizedValue, error: String(error) },
      level: "warning",
    });
    const { pathname, search } = splitPathAndSearch(normalizedValue);
    return mapMiragePathToRoute(pathname, search);
  }
}
