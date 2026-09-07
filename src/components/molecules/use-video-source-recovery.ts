import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { VideoPlayer } from "expo-video";
import { useVideoPlayerLeaseVersion } from "@/src/hooks/use-video-player-controller";
import { getAppliedVideoSourceUri, isVideoPlayerControlledElsewhere, type VideoPlayerLease } from "@/src/utils/video-player-handoff";
import { replaceVideoPlayerSourceAsync, subscribeVideoSourceFailures } from "@/src/utils/video-source-replacement";
import { createVideoRecovery, type VideoRecoveryPhase } from "@/src/utils/video-recovery";

export function useVideoSourceRecovery({
  uri, player, lease = null, enabled, shouldPlay, processing = false,
}: {
  uri: string;
  player: VideoPlayer;
  lease?: VideoPlayerLease | null;
  enabled: boolean;
  shouldPlay: boolean;
  processing?: boolean;
}) {
  useVideoPlayerLeaseVersion();
  const controlledElsewhere = isVideoPlayerControlledElsewhere(player, lease);
  const [phase, setPhase] = useState<VideoRecoveryPhase>("loading");
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const workVersion = useRef(0);
  const mountedRef = useRef(false);
  const engineRef = useRef<ReturnType<typeof createVideoRecovery> | null>(null);
  const current = useRef({ uri, player, lease, enabled, shouldPlay, processing });
  current.current = { uri, player, lease, enabled, shouldPlay, processing };
  const [active, setActive] = useState(AppState.currentState === "active");
  const owned = useCallback(() => {
    const value = current.current;
    const appliedUri = getAppliedVideoSourceUri(player);
    return value.uri === uri && value.player === player && value.enabled &&
      (appliedUri === null || appliedUri === uri) &&
      AppState.currentState === "active" &&
      !isVideoPlayerControlledElsewhere(player, value.lease);
  }, [uri, player]);
  const acceptsEvent = useCallback((eventSourceUri?: string | null) => {
    try { return mountedRef.current && owned() && (eventSourceUri === undefined ? getAppliedVideoSourceUri(player) : eventSourceUri) === uri; }
    catch { return false; }
  }, [owned, player, uri]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    const valid = () => mounted && owned();
    const engine = createVideoRecovery({
      eligible: valid,
      changed: setPhase,
      reload: async () => {
        if (!valid()) return;
        const version = workVersion.current;
        const expectedLease = current.current.lease;
        const canReplace = () => valid() && version === workVersion.current && current.current.lease === expectedLease;
        let position = 0;
        try { position = player.currentTime; } catch { /* Released native player. */ }
        revisionRef.current += 1;
        setRevision(revisionRef.current);
        const replaced = await replaceVideoPlayerSourceAsync(player, uri, canReplace).catch((error) => {
          if (current.current.processing) return false;
          throw error;
        });
        if (!replaced || !canReplace() || getAppliedVideoSourceUri(player) !== uri) return;
        if (position > 0.5) player.currentTime = position;
        if (current.current.shouldPlay) player.play();
      },
    });
    engineRef.current = engine;
    setPhase("loading");
    const unsubscribe = subscribeVideoSourceFailures((failedPlayer, source, error) => {
      if (!current.current.processing && failedPlayer === player && source === uri && valid()) engine.fail(error);
    });
    let subscription: { remove(): void } | undefined;
    try {
      subscription = player.addListener("statusChange", ({ status, error }) => {
        if (!current.current.processing && status === "error" && acceptsEvent() && player.status === "error") engine.fail(error);
      });
      if (!current.current.processing && player.status === "error" && acceptsEvent()) engine.fail();
    } catch { /* Player teardown is handled by the prepare gate. */ }
    return () => {
      mounted = false;
      mountedRef.current = false;
      engine.dispose();
      unsubscribe();
      try { subscription?.remove(); } catch { /* Already released. */ }
    };
  }, [acceptsEvent, owned, player, uri]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") { workVersion.current += 1; engineRef.current?.suspend(); }
      setActive(state === "active");
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (owned()) {
      engineRef.current?.resume();
      try {
        if (!current.current.processing && acceptsEvent() && player.status === "error") engineRef.current?.fail();
      } catch { /* Already released. */ }
    } else engineRef.current?.suspend();
    return () => { workVersion.current += 1; engineRef.current?.suspend(); };
  }, [acceptsEvent, active, enabled, controlledElsewhere, lease, owned, player]);

  useEffect(() => {
    if (!owned() || !shouldPlay || phase === "playable" || phase === "terminal") return;
    const timer = setTimeout(() => { if (owned()) engineRef.current?.fail(); }, 15000);
    return () => clearTimeout(timer);
  }, [active, enabled, controlledElsewhere, lease, owned, phase, revision, shouldPlay]);

  const firstFrame = useCallback(() => {
    if (revisionRef.current !== revision || !acceptsEvent()) return false;
    // iOS can render its first frame before status advances from loading.
    // That frame is display readiness; waiting for another one leaves the poster up.
    try { if (player.status === "idle" || player.status === "error") return false; } catch { return false; }
    return engineRef.current?.firstFrame() ?? false;
  }, [acceptsEvent, player, revision]);
  const retry = useCallback(() => { engineRef.current?.retry(); }, []);
  const terminal = useCallback(() => { engineRef.current?.terminal(); }, []);
  return { phase, revision, firstFrame, retry, terminal, acceptsEvent };
}
