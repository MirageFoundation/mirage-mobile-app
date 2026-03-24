import { setShareScheme } from "@/src/utils/share-scheme";
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { useAuthStore } from "@/src/stores/auth-store";

const MIRAGE_HOSTS = ["mirage.talk", "mirage.vote"];

function mapWebPathToAppRoute(pathname: string, search: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/(tabs)";

  const prefix = segments[0];

  if (segments.length >= 2) {
    const id = segments[1];
    if (prefix === "p") return `/post/${id}`;
    if (prefix === "u") return `/user/${id}`;
    if (prefix === "t") return `/topic/${id}`;
  }

  if (prefix === "home") return "/(tabs)";
  if (prefix === "following") return "/(tabs)/following";
  if (prefix === "inbox") return "/(tabs)/inbox";
  if (prefix === "profile") return "/(tabs)/profile";
  if (prefix === "search") return `/search${search || ""}`;
  if (prefix === "topics") return "/topics";
  if (prefix === "settings") return "/settings";
  if (prefix === "subscription") return "/subscription";
  if (prefix === "agents") return "/agents";

  return null;
}

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: string;
}) {
  const scheme = path.match(/^([^:]+):\/\//)?.[1];
  if (scheme) {
    setShareScheme(scheme);
  }

  if (path.includes("dataUrl=") && path.includes("ShareKey")) {
    return "/(tabs)/create";
  }

  try {
    const url = new URL(path);
    if (MIRAGE_HOSTS.includes(url.hostname)) {
      const appRoute = mapWebPathToAppRoute(url.pathname, url.search);
      if (appRoute) {
        const isLoggedIn = useAuthStore.getState().isLoggedIn;
        if (!isLoggedIn) {
          useDeepLinkStore.getState().setPendingRoute(appRoute);
          return "/(tabs)";
        }
        return appRoute;
      }
    }
  } catch {}

  return path;
}
