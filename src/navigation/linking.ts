import * as Linking from "expo-linking";
import * as Sentry from "@sentry/react-native";

import { getRootPostId } from "@/src/api/read/endpoints/posts";
import { usePreferencesStore } from "@/src/stores";
import { setShareScheme } from "@/src/utils/share-scheme";

import {
  navigateWithAuthGuard,
  resolveAuthNavigationTarget,
} from "./auth-navigation";
import { isAppRoute, resolveMirageUrl } from "./route-map";

function getAdditionalMirageHosts(): string[] {
  return [usePreferencesStore.getState().apiServer];
}

function resolveRootPostForComment(commentId: string) {
  getRootPostId({ comment_id: commentId })
    .then((response) => {
      if (response.root_post_id && response.root_post_id !== commentId) {
        navigateWithAuthGuard(
          `/post/${response.root_post_id}?highlight=${commentId}`,
          "replace",
        );
      }
    })
    .catch((error) => {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Failed to resolve root post",
        data: { commentId, error: String(error) },
        level: "warning",
      });
    });
}

export async function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  const scheme = path.match(/^([^:]+):\/\//)?.[1];
  if (scheme) {
    setShareScheme(scheme);
  }

  if (path.includes("dataUrl=") && path.includes("ShareKey")) {
    return "/(tabs)/create";
  }

  if (isAppRoute(path)) {
    return path;
  }

  const match = resolveMirageUrl(path, getAdditionalMirageHosts());
  if (!match) {
    return "";
  }

  if (!match.requiresAuth) {
    return match.route;
  }

  const target = resolveAuthNavigationTarget(match.route);
  return target === match.route ? target : "";
}

export async function handleMirageLink(url: string): Promise<boolean> {
  if (isAppRoute(url)) {
    navigateWithAuthGuard(url);
    return true;
  }

  const match = resolveMirageUrl(url, getAdditionalMirageHosts());
  if (!match) {
    return false;
  }

  navigateWithAuthGuard(match.route);

  if (match.type === "post" && match.resourceId) {
    resolveRootPostForComment(match.resourceId);
  }

  return true;
}

export function openUrlOrInternal(url: string): void {
  const fullUrl =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;

  handleMirageLink(fullUrl).then((handled) => {
    if (!handled) {
      Linking.openURL(fullUrl).catch((error) => {
        Sentry.captureException(error, {
          tags: { feature: "links", operation: "open-url" },
          extra: { url: fullUrl },
        });
      });
    }
  });
}
