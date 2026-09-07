import type { VideoPlayer, VideoSource } from "expo-video";
import {
  getVideoSourceUri,
  setAppliedVideoSourceUri,
} from "@/src/utils/video-player-handoff";

type VideoSourceReplacementState = {
  tail: Promise<void>;
  version: number;
};

const replacementStates = new WeakMap<VideoPlayer, VideoSourceReplacementState>();
const failureListeners = new Set<(player: VideoPlayer, uri: string | null, error: unknown) => void>();

export function subscribeVideoSourceFailures(listener: (player: VideoPlayer, uri: string | null, error: unknown) => void) {
  failureListeners.add(listener);
  return () => { failureListeners.delete(listener); };
}

export function getCachedVideoSource(source: VideoSource): VideoSource {
  if (typeof source !== "string" || !/^https?:\/\//i.test(source)) {
    return source;
  }
  const path = source.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".m3u8") || path.endsWith(".mpd")) {
    return source;
  }
  return {
    uri: source,
    useCaching: true,
  };
}

/**
 * Serializes every source replacement for a native player. A newer queued
 * source supersedes older work that has not started yet, which prevents
 * retries, list recycling, and viewability changes from replacing one player
 * concurrently.
 */
export function replaceVideoPlayerSourceAsync(
  player: VideoPlayer,
  source: VideoSource,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  let state = replacementStates.get(player);
  if (!state) {
    state = { tail: Promise.resolve(), version: 0 };
    replacementStates.set(player, state);
  }

  const requestVersion = ++state.version;
  const result = state.tail.then(async () => {
    if (requestVersion !== state.version || !isCurrent()) return false;
    setAppliedVideoSourceUri(player, null);
    try {
      await player.replaceAsync(getCachedVideoSource(source));
    } catch (error) {
      if (requestVersion === state.version && isCurrent()) {
        for (const listener of failureListeners) listener(player, getVideoSourceUri(source), error);
      }
      throw error;
    }
    if (requestVersion !== state.version || !isCurrent()) return false;
    setAppliedVideoSourceUri(player, getVideoSourceUri(source));
    return true;
  });
  state.tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
