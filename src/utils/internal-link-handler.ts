import * as Linking from "expo-linking";
import { router } from "@/src/utils/guarded-router";
import { usePreferencesStore } from "@/src/stores";
import { getRootPostId } from "@/src/api/read/endpoints/posts";
import * as Sentry from "@sentry/react-native";

type MirageLinkType =
  | "post"
  | "user"
  | "topic"
  | "search"
  | "topics"
  | "settings"
  | "subscription"
  | "inbox"
  | "invite"
  | "signup"
  | "home"
  | "following"
  | "agents"
  | null;

interface ParsedMirageLink {
  type: MirageLinkType;
  id: string;
  server: string;
  query?: string;
  ref?: string;
}

const SINGLE_SEGMENT_ROUTES: Record<string, MirageLinkType> = {
  home: "home",
  following: "following",
  search: "search",
  topics: "topics",
  settings: "settings",
  subscription: "subscription",
  inbox: "inbox",
  agents: "agents",
};

function parseMirageUrl(url: string): ParsedMirageLink | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const pathSegments = parsed.pathname.split("/").filter(Boolean);

    if (pathSegments.length === 0) return null;

    const prefix = pathSegments[0];

    if (pathSegments.length >= 2) {
      const id = pathSegments[1];

      if (prefix === "p") {
        return { type: "post", id, server: hostname };
      }

      if (prefix === "u") {
        return { type: "user", id, server: hostname };
      }

      if (prefix === "t") {
        return { type: "topic", id, server: hostname };
      }
    }

    if (prefix === "signup" || prefix === "create_account") {
      const invite = parsed.searchParams.get("invite");
      const ref = parsed.searchParams.get("ref");
      if (invite) {
        return { type: "signup", id: invite, server: hostname };
      }
      if (ref) {
        return { type: "signup", id: "", server: hostname, ref };
      }
      if (prefix === "create_account") {
        return { type: "invite", id: "", server: hostname };
      }
      return { type: "signup", id: "", server: hostname };
    }

    if (prefix === "search") {
      return {
        type: "search",
        id: "",
        server: hostname,
        query: parsed.searchParams.get("q") || "",
      };
    }

    const singleType = SINGLE_SEGMENT_ROUTES[prefix];
    if (singleType && pathSegments.length === 1) {
      return { type: singleType, id: "", server: hostname };
    }

    return null;
  } catch {
    return null;
  }
}

function getCurrentServer(): string {
  return usePreferencesStore.getState().apiServer;
}

function isInternalLink(parsedLink: ParsedMirageLink): boolean {
  const currentServer = getCurrentServer();
  return parsedLink.server === currentServer;
}

export async function handleMirageLink(url: string): Promise<boolean> {
  const parsed = parseMirageUrl(url);

  if (!parsed) {
    return false;
  }

  if (parsed.type === "user") {
    router.push(`/user/${parsed.id}`);
    return true;
  }

  if (parsed.type === "post") {
    router.push(`/post/${parsed.id}`);
    getRootPostId({ comment_id: parsed.id })
      .then((response) => {
        if (response.root_post_id && response.root_post_id !== parsed.id) {
          router.replace(`/post/${response.root_post_id}?highlight=${parsed.id}`);
        }
      })
      .catch((err) => {
        Sentry.addBreadcrumb({ category: "navigation", message: "Failed to resolve root post", data: { commentId: parsed.id, error: String(err) }, level: "warning" });
      });
    return true;
  }

  if (parsed.type === "topic") {
    router.push(`/topic/${parsed.id}`);
    return true;
  }

  if (parsed.type === "search") {
    const params = parsed.query ? `?q=${encodeURIComponent(parsed.query)}` : "";
    router.push(`/search${params}` as any);
    return true;
  }

  if (parsed.type === "topics") {
    router.push("/topics");
    return true;
  }

  if (parsed.type === "settings") {
    router.push("/settings");
    return true;
  }

  if (parsed.type === "subscription") {
    router.push("/subscription");
    return true;
  }

  if (parsed.type === "inbox") {
    router.push("/(tabs)/inbox");
    return true;
  }

  if (parsed.type === "home") {
    router.push("/(tabs)" as any);
    return true;
  }

  if (parsed.type === "following") {
    router.push("/(tabs)/following");
    return true;
  }

  if (parsed.type === "signup") {
    if (parsed.id) {
      router.push({ pathname: "/(auth)/username", params: { invite: parsed.id } } as any);
    } else if (parsed.ref) {
      router.push({ pathname: "/(auth)/username", params: { ref: parsed.ref } } as any);
    } else {
      router.push("/(auth)/username" as any);
    }
    return true;
  }

  if (parsed.type === "invite") {
    router.push(`/invite-and-earn`);
    return true;
  }

  if (parsed.type === "agents") {
    router.push("/agents");
    return true;
  }

  return false;
}

export function openUrlOrInternal(url: string): void {
  const fullUrl =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;

  handleMirageLink(fullUrl).then((handled) => {
    if (!handled) {
      Linking.openURL(fullUrl).catch((err) => {
        Sentry.captureException(err, {
          tags: { feature: "links", operation: "open-url" },
          extra: { url: fullUrl },
        });
      });
    }
  });
}
