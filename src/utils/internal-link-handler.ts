import * as Linking from "expo-linking";
import { router } from "expo-router";
import { usePreferencesStore } from "@/src/stores";
import { getRootPostId } from "@/src/api/read/endpoints/posts";

type MirageLinkType = "post" | "user" | null;

interface ParsedMirageLink {
  type: MirageLinkType;
  id: string;
  server: string;
}

function parseMirageUrl(url: string): ParsedMirageLink | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const pathSegments = parsed.pathname.split("/").filter(Boolean);

    if (pathSegments.length < 2) return null;

    const prefix = pathSegments[0];
    const id = pathSegments[1];

    if (prefix === "p") {
      return { type: "post", id, server: hostname };
    }

    if (prefix === "u") {
      return { type: "user", id, server: hostname };
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
      .catch(() => {});
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
      Linking.openURL(fullUrl).catch(() => {});
    }
  });
}
