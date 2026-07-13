import * as Sentry from "@sentry/react-native";
import type { Video } from "expo-av";
import { AppState } from "react-native";

const EXPECTED_LIFECYCLE_ERROR_PATTERNS = [
  "has not yet loaded",
  "invalid view returned from registry",
  "audiofocusnotacquired",
  "audio focus could not be acquired",
  "audio session not activated",
];

export function isExpectedVideoLifecycleError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return EXPECTED_LIFECYCLE_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
}

type PlayNativeVideoOptions = {
  isMuted: boolean;
  isCancelled: () => boolean;
  component: string;
  action: string;
  uri?: string | null;
};

function addPlaybackSkipBreadcrumb(
  reason: string,
  options: PlayNativeVideoOptions,
  error?: unknown,
): void {
  Sentry.addBreadcrumb({
    category: "feed-video",
    message: `Video playback skipped: ${reason}`,
    level: "info",
    data: {
      component: options.component,
      action: options.action,
      appState: AppState.currentState,
      ...(error !== undefined
        ? { error: error instanceof Error ? error.message : String(error) }
        : {}),
    },
  });
}

/**
 * Single owner for imperative native video playback.
 *
 * Rules:
 * - never issues native calls while the app is backgrounded
 * - re-checks cancellation after every await
 * - never calls playAsync after setStatusAsync (one operation, no double dispatch)
 * - expected lifecycle rejections (unloaded view, recycled native view,
 *   background audio focus) are breadcrumbs, not Sentry errors
 */
export async function playNativeVideo(
  video: Video | null,
  options: PlayNativeVideoOptions,
): Promise<boolean> {
  if (!video || options.isCancelled()) return false;
  if (AppState.currentState !== "active") {
    addPlaybackSkipBreadcrumb("app not active", options);
    return false;
  }

  try {
    const status = await video.getStatusAsync();
    if (options.isCancelled()) return false;
    if (!status.isLoaded) {
      addPlaybackSkipBreadcrumb("video not loaded", options);
      return false;
    }
    if (status.isPlaying) return true;
    if (AppState.currentState !== "active") {
      addPlaybackSkipBreadcrumb("app backgrounded during status check", options);
      return false;
    }
    await video.setStatusAsync({ shouldPlay: true, isMuted: options.isMuted });
    return true;
  } catch (error) {
    if (options.isCancelled() || isExpectedVideoLifecycleError(error)) {
      addPlaybackSkipBreadcrumb("expected lifecycle rejection", options, error);
      return false;
    }
    Sentry.captureException(error, {
      tags: {
        feature: "feed-video",
        component: options.component,
        action: options.action,
      },
      fingerprint: ["feed-video", options.action, "{{ default }}"],
      extra: { uri: options.uri ?? undefined },
    });
    return false;
  }
}
