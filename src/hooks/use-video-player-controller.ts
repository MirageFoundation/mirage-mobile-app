import * as Sentry from "@sentry/react-native";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import {
  useVideoPlayer,
  type BufferOptions,
  type VideoPlayer,
  type VideoSource,
} from "expo-video";
import {
  getVideoPlayerLeaseVersion,
  getVideoSourceUri,
  isVideoPlayerLeased,
  offerHandoffPlayer,
  revokeHandoffOffer,
  setAppliedVideoSourceUri,
  subscribeVideoPlayerLeases,
} from "@/src/utils/video-player-handoff";

export { getAppliedVideoSourceUri, getVideoSourceUri } from "@/src/utils/video-player-handoff";

let nextVideoPlayerDiagnosticId = 0;

/**
 * Buffer profiles bound the memory each native player may hold.
 *
 * Android ExoPlayer defaults to a 20s forward buffer per player; with several
 * warm feed players prepared at once that is the main video memory cost.
 * - `feedWarm`: prepared-but-not-active feed players. Small forward buffer,
 *   hard byte cap on Android.
 * - `feedActive`: the single actively playing feed video. Enough buffer for
 *   smooth playback without hoarding.
 * - `detail`: detail/fullscreen/editor surfaces where quality and seek
 *   smoothness matter; platform defaults.
 */
export type VideoBufferProfile = "feedWarm" | "feedActive" | "detail";

const FEED_WARM_MAX_BUFFER_BYTES = 15 * 1024 * 1024;

const BUFFER_PROFILES: Record<VideoBufferProfile, BufferOptions> = {
  feedWarm: {
    preferredForwardBufferDuration: 4,
    ...(Platform.OS === "android"
      ? { maxBufferBytes: FEED_WARM_MAX_BUFFER_BYTES }
      : { waitsToMinimizeStalling: true }),
  },
  feedActive: {
    preferredForwardBufferDuration: 10,
    ...(Platform.OS === "android" ? { maxBufferBytes: 0 } : {}),
  },
  detail: {
    // Platform defaults: Android 20s, iOS automatic.
    preferredForwardBufferDuration: Platform.OS === "android" ? 20 : 0,
    ...(Platform.OS === "android" ? { maxBufferBytes: 0 } : {}),
  },
};

type VideoPlayerControllerOptions = {
  muted?: boolean;
  loop?: boolean;
  shouldPlay?: boolean;
  timeUpdateInterval?: number;
  initialTime?: number;
  bufferProfile?: VideoBufferProfile;
  /**
   * When set, the prepared player is offered for feed->detail handoff under
   * this key (canonical asset id). While an adopter holds the lease, this
   * controller suppresses all writes to the player and re-asserts its desired
   * state when the lease is released.
   */
  handoffKey?: string | null;
};

export function applyVideoBufferProfile(
  player: VideoPlayer,
  profile: VideoBufferProfile,
): void {
  player.bufferOptions = BUFFER_PROFILES[profile];
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

function getSourceKey(source: VideoSource): string | null {
  if (source == null) return null;
  if (typeof source === "string") return source;
  if (typeof source === "number") return `asset:${source}`;
  try {
    return JSON.stringify(source);
  } catch {
    return String(source);
  }
}

/**
 * Owns a single, stable native video player per mounted component and swaps
 * media in and out with serialized `replaceAsync` calls.
 *
 * In expo-video 3.x, `useVideoPlayer` destroys and recreates the native
 * player whenever its source argument changes. In feed lists (where FlashList
 * recycles card components and the warm-window gate flips sources between
 * `null` and a uri) that recreation happens constantly during scroll and is a
 * major source of jank. Passing a stable `null` source here means the player
 * is created exactly once per component instance; source changes become cheap
 * native `replaceAsync` swaps, and `replaceAsync(null)` releases buffers
 * without tearing down the player. Combined with list recycling this behaves
 * like a bounded player pool.
 */
export function useVideoPlayerController(
  source: VideoSource,
  {
    muted = false,
    loop = false,
    shouldPlay = false,
    timeUpdateInterval = 0,
    initialTime = 0,
    bufferProfile = "detail",
    handoffKey = null,
  }: VideoPlayerControllerOptions = {},
): VideoPlayer {
  // Re-renders (and re-runs the effects below) whenever any handoff lease
  // changes, so a controller whose player was leased out re-asserts its state
  // once the adopter releases it.
  const leaseVersion = useSyncExternalStore(
    subscribeVideoPlayerLeases,
    getVideoPlayerLeaseVersion,
  );
  const diagnosticId = useRef(++nextVideoPlayerDiagnosticId).current;
  const player = useVideoPlayer(null, (createdPlayer) => {
    Sentry.addBreadcrumb({
      category: "video-player",
      message: "Native video player created",
      level: "info",
      data: {
        diagnosticId,
        bufferProfile,
      },
    });
    createdPlayer.muted = muted;
    createdPlayer.loop = loop;
    createdPlayer.timeUpdateEventInterval = timeUpdateInterval;
    createdPlayer.bufferOptions = BUFFER_PROFILES[bufferProfile];
  });

  const sourceKey = getSourceKey(source);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const shouldPlayRef = useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;
  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;
  const appliedSourceKeyRef = useRef<string | null | undefined>(undefined);
  const replaceChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // While an adopter (detail screen) holds this player, leave it alone; the
    // leaseVersion dependency re-runs this effect after release.
    if (isVideoPlayerLeased(player)) return;
    if (appliedSourceKeyRef.current === sourceKey) return;
    appliedSourceKeyRef.current = sourceKey;
    const targetSource = sourceRef.current;
    replaceChainRef.current = replaceChainRef.current
      .then(async () => {
        // A newer source superseded this one while earlier swaps were queued.
        if (appliedSourceKeyRef.current !== sourceKey) return;
        if (isVideoPlayerLeased(player)) return;
        await player.replaceAsync(getCachedVideoSource(targetSource));
        setAppliedVideoSourceUri(player, getVideoSourceUri(targetSource));
        if (appliedSourceKeyRef.current !== sourceKey) return;
        if (sourceKey != null && initialTimeRef.current > 0.5) {
          player.currentTime = initialTimeRef.current;
        }
        if (sourceKey != null && shouldPlayRef.current) {
          player.play();
        }
      })
      .catch((error) => {
        Sentry.addBreadcrumb({
          category: "video-player",
          message: "Video source replacement failed",
          level: "warning",
          data: {
            diagnosticId,
            hasSource: sourceKey != null,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });
  }, [diagnosticId, player, sourceKey, leaseVersion]);

  useEffect(() => {
    if (!handoffKey || sourceKey == null) return;
    if (isVideoPlayerLeased(player)) return;
    offerHandoffPlayer(handoffKey, player);
    return () => revokeHandoffOffer(handoffKey, player);
  }, [handoffKey, player, sourceKey, leaseVersion]);

  useEffect(() => {
    if (isVideoPlayerLeased(player)) return;
    player.muted = muted;
  }, [muted, player, leaseVersion]);

  useEffect(() => {
    if (isVideoPlayerLeased(player)) return;
    player.loop = loop;
  }, [loop, player, leaseVersion]);

  useEffect(() => {
    if (isVideoPlayerLeased(player)) return;
    player.timeUpdateEventInterval = timeUpdateInterval;
  }, [player, timeUpdateInterval, leaseVersion]);

  useEffect(() => {
    if (isVideoPlayerLeased(player)) return;
    player.bufferOptions = BUFFER_PROFILES[bufferProfile];
  }, [bufferProfile, player, leaseVersion]);

  useEffect(() => {
    if (isVideoPlayerLeased(player)) return;
    if (shouldPlay) {
      Sentry.addBreadcrumb({
        category: "video-player",
        message: "Native video playback requested",
        level: "info",
        data: { diagnosticId, hasSource: source != null },
      });
      player.play();
    } else {
      player.pause();
    }
  }, [diagnosticId, player, shouldPlay, source, leaseVersion]);

  return player;
}
