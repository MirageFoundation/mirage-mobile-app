const MIRAGE_HOSTS = ["mirage.talk", "mirage.vote"] as const;
const MIRAGE_SCHEME_PREFIX = "mirage";
const TAB_HOME_ROUTE = "/(tabs)";

const KNOWN_APP_ROUTE_PREFIXES = [
  "/(auth)/",
  "/(tabs)",
  "/post/",
  "/user/",
  "/topic/",
  "/search",
  "/topics",
  "/settings",
  "/subscription",
  "/agents",
  "/invite-and-earn",
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
  | "agents";

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

export function isAppRoute(path: string): boolean {
  const { pathname } = splitPathAndSearch(path);

  return KNOWN_APP_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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

    if (prefix === "p") {
      return {
        type: "post",
        hostname: "",
        route: `/post/${resourceId}`,
        requiresAuth: true,
        resourceId,
      };
    }

    if (prefix === "u") {
      return {
        type: "user",
        hostname: "",
        route: `/user/${resourceId}`,
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
      route: `/(auth)/username${suffix}`,
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
      route: "/(tabs)/following",
      requiresAuth: true,
    };
  }

  if (prefix === "inbox") {
    return {
      type: "inbox",
      hostname: "",
      route: "/(tabs)/inbox",
      requiresAuth: true,
    };
  }

  if (prefix === "profile") {
    return {
      type: "profile",
      hostname: "",
      route: "/(tabs)/profile",
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
  } catch {
    const { pathname, search } = splitPathAndSearch(normalizedValue);
    return mapMiragePathToRoute(pathname, search);
  }
}
