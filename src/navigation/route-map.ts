import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

import { isRoutableCommunitySlug, normalizeCommunitySlug } from "@/src/domain/communities";

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
  "/post-media/",
  "/user/",
  "/c/",
  "/search",
  "/communities",
  "/curation-invitations",
  "/creator-earnings",
  "/settings",
  "/subscription",
  "/blocked-list",
  "/user-following/",
] as const;

export const NOT_FOUND_ROUTE = "/_not-found";

const OBSOLETE_EXACT_PATHS = new Set([
  "/agents",
  "/annotate",
  "/quests",
  "/referrals",
  "/invite-and-earn",
  "/topics",
]);

export type MirageRouteType =
  | "post"
  | "user"
  | "community"
  | "search"
  | "communities"
  | "curationInvitations"
  | "creatorEarnings"
  | "settings"
  | "subscription"
  | "inbox"
  | "signup"
  | "home"
  | "following"
  | "profile"
  | "create"
  | "blocks"
  | "follows"
  | "login"
  | "recoveryPhrase"
  | "notFound";

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

export function isObsoleteMiragePath(path: string): boolean {
  const { pathname } = splitPathAndSearch(path);
  if (OBSOLETE_EXACT_PATHS.has(pathname)) return true;
  const segments = pathname.split("/").filter(Boolean);
  const prefix = segments[0];
  return prefix === "t" || prefix === "topic" || prefix === "topics";
}

export function isNotFoundRoute(path: string): boolean {
  const { pathname } = splitPathAndSearch(path);
  return pathname === NOT_FOUND_ROUTE || isObsoleteMiragePath(pathname);
}

function notFoundMatch(): MirageRouteMatch {
  return {
    type: "notFound",
    hostname: "",
    route: NOT_FOUND_ROUTE,
    requiresAuth: false,
  };
}

export function isAppRoute(path: string): boolean {
  const { pathname } = splitPathAndSearch(path);
  if (isNotFoundRoute(pathname)) return false;

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
  const { pathname: rawPathname } = splitPathAndSearch(route);
  const pathname = rawPathname.replace(/^\/\(app\)(?=\/|$)/, "")
    .replace(/^\/\((?:tabs|auth)\)(?=\/|$)/, "") || "/";
  if (pathname === TAB_HOME_ROUTE || pathname === "/index") return false;
  if (isNotFoundRoute(pathname)) return false;
  if (pathname.startsWith("/post/") || pathname.startsWith("/p/") || pathname.startsWith("/post-media/")) return false;
  if (pathname === "/communities" || pathname.startsWith("/c/")) return false;
  if (pathname.startsWith("/(auth)/")) return false;
  return ![
    "/login",
    "/username",
    "/recovery-phrase",
  ].includes(pathname);
}

const INTERNAL_SCREEN_PATHS = new Set([
  "/video-editor", "/comment-compose", "/history", "/saved-posts",
  "/delete-account", "/change-username", "/view-recovery-phrase", "/edit-post",
  "/subscription",
]);

/** Fixed internal targets; external URLs still use the narrower public mapping. */
export function validatePendingRoute(route: string): string | null {
  if (!route.startsWith("/") || /[\\\u0000-\u001f]/.test(route)) return null;
  const { pathname: rawPathname, search } = splitPathAndSearch(route);
  const pathname = rawPathname.replace(/^\/\(app\)(?=\/|$)/, "")
    .replace(/^\/\((?:tabs|auth)\)(?=\/|$)/, "") || "/";
  if (INTERNAL_SCREEN_PATHS.has(pathname)) return `${pathname}${search}`;
  const match = mapMiragePathToRoute(pathname, search);
  return match && match.type !== "notFound" ? match.route : null;
}

export function mapMiragePathToRoute(
  pathname: string,
  search: string = "",
): MirageRouteMatch | null {
  if (!pathname.startsWith("/") || pathname.includes("//")) return null;
  pathname = pathname.replace(/^\/\(app\)(?=\/|$)/, "")
    .replace(/^\/\((?:tabs|auth)\)(?=\/|$)/, "") || "/";
  const segments = pathname.split("/").filter(Boolean);
  try {
    if (segments.some((segment) => /[\/\\?#]/.test(decodeURIComponent(segment)))) return null;
  } catch {
    return null;
  }
  if (isNotFoundRoute(pathname)) return notFoundMatch();

  if (segments.length === 0 || (segments.length === 1 && segments[0] === "index")) {
    return {
      type: "home",
      hostname: "",
      route: TAB_HOME_ROUTE,
      requiresAuth: false,
    };
  }

  const prefix = segments[0];

  if (segments.length >= 2) {
    const resourceId = segments[1];

    if (prefix === "post-media" && segments.length === 2) {
      return { type: "post", hostname: "", route: `/post-media/${resourceId}${search}`, requiresAuth: false, resourceId };
    }

    if ((prefix === "p" || prefix === "post") && segments.length === 2) {
      // Public URLs use /p/<id>, but the canonical in-app screen is
      // /post/[id] (the /p/ route file is only a Redirect alias for raw
      // external paths). Emit the canonical route directly.
      return {
        type: "post",
        hostname: "",
        route: `/post/${resourceId}${search || ""}`,
        requiresAuth: false,
        resourceId,
      };
    }

    if (prefix === "comment" && segments.length === 2) {
      const postSearch = withDefaultSearchParam(search, "depth", "5");
      return {
        type: "post",
        hostname: "",
        route: `/post/${resourceId}${postSearch}`,
        requiresAuth: false,
        resourceId,
      };
    }

    if (prefix === "c") {
      if (segments.length !== 2 && segments.length !== 3 && segments.length !== 4) return null;
      let slug = resourceId;
      try {
        slug = decodeURIComponent(resourceId);
      } catch {
        return null;
      }
      slug = normalizeCommunitySlug(slug);
      if (!isRoutableCommunitySlug(slug)) return null;
      if (segments.length === 2) {
        return {
          type: "community",
          hostname: "",
          route: `/c/${encodeURIComponent(slug)}${search || ""}`,
          requiresAuth: false,
          resourceId: slug,
        };
      }
      if (segments[2] !== "teams") return null;
      if (segments.length === 3) {
        return {
          type: "community",
          hostname: "",
          route: `/c/${encodeURIComponent(slug)}/teams${search || ""}`,
          requiresAuth: false,
          resourceId: slug,
        };
      }
      return {
        type: "community",
        hostname: "",
        route: `/c/${encodeURIComponent(slug)}/teams/${encodeURIComponent(decodeURIComponent(segments[3]!))}${search || ""}`,
        requiresAuth: false,
        resourceId: slug,
      };
    }

    if ((prefix === "u" || prefix === "user" || prefix === "user-following") && segments.length === 2) {
      return {
        type: prefix === "user-following" ? "follows" : "user",
        hostname: "",
        route: `/${prefix === "user-following" ? "user-following" : "user"}/${resourceId}${search || ""}`,
        requiresAuth: true,
        resourceId,
      };
    }

    if (prefix === "t" || prefix === "topic") {
      return notFoundMatch();
    }
  }

  if (segments.length !== 1) return null;

  if (prefix === "signup" || prefix === "create_account" || prefix === "username") {
    return {
      type: "signup",
      hostname: "",
      route: `/username`,
      requiresAuth: false,
    };
  }

  if (prefix === "recovery-phrase") {
    const username = new URLSearchParams(search).get("username");
    const params = new URLSearchParams();
    if (username) params.set("username", username);
    return {
      type: "recoveryPhrase",
      hostname: "",
      route: `/recovery-phrase${params.size ? `?${params}` : ""}`,
      requiresAuth: false,
    };
  }

  if (prefix === "home") {
    return {
      type: "home",
      hostname: "",
      route: TAB_HOME_ROUTE,
      requiresAuth: false,
    };
  }

  if (prefix === "following") {
    return {
      type: "following",
      hostname: "",
      route: `/following${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "inbox") {
    return {
      type: "inbox",
      hostname: "",
      route: `/inbox${search || ""}`,
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

  if (prefix === "communities") {
    return {
      type: "communities",
      hostname: "",
      route: `/communities${search || ""}`,
      requiresAuth: false,
    };
  }

  if (prefix === "curation-invitations") {
    return {
      type: "curationInvitations",
      hostname: "",
      route: `/curation-invitations${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "creator-earnings") {
    return {
      type: "creatorEarnings",
      hostname: "",
      route: `/creator-earnings${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "topics" || prefix === "topic") {
    return notFoundMatch();
  }

  if (prefix === "settings") {
    return {
      type: "settings",
      hostname: "",
      route: `/settings${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "subscription") {
    if (Platform.OS === "ios") return null;
    return {
      type: "subscription",
      hostname: "",
      route: `/subscription${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "agents" || prefix === "annotate" || prefix === "quests" || prefix === "invite-and-earn") {
    return notFoundMatch();
  }

  if (prefix === "create_post" || prefix === "create") {
    return {
      type: "create",
      hostname: "",
      route: `/create${search || ""}`,
      requiresAuth: true,
    };
  }

  if (prefix === "blocks" || prefix === "blocked-list") {
    return {
      type: "blocks",
      hostname: "",
      route: `/blocked-list${search || ""}`,
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
    return notFoundMatch();
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

function withHostname(
  match: MirageRouteMatch | null,
  hostname: string,
  fallbackToNotFound: boolean,
): MirageRouteMatch | null {
  if (match) {
    return { ...match, hostname };
  }
  return fallbackToNotFound ? { ...notFoundMatch(), hostname } : null;
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
    if (url.username || url.password || normalizedValue.includes("\\")) return null;

    if (isMirageScheme(scheme)) {
      const logicalPath = url.hostname
        ? `/${url.hostname}${url.pathname}`
        : url.pathname || "/";
      return withHostname(
        mapMiragePathToRoute(logicalPath, url.search),
        url.hostname,
        true,
      );
    }

    if ((scheme !== "https" && scheme !== "http") || !isMirageHost(url.hostname, additionalHosts)) {
      return null;
    }

    return withHostname(
      mapMiragePathToRoute(url.pathname, url.search),
      url.hostname,
      true,
    );
  } catch {
    Sentry.addBreadcrumb({
      category: "deep-link",
      message: "URL parse failed, falling back to path split",
      data: { isPath: normalizedValue.startsWith("/") },
      level: "warning",
    });
    const { pathname, search } = splitPathAndSearch(normalizedValue);
    return withHostname(mapMiragePathToRoute(pathname, search), "", true);
  }
}
