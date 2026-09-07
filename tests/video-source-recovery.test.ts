// @ts-nocheck -- Bun test types are provided by the runtime.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createVideoRecovery } from "../src/utils/video-recovery";
import * as ownership from "../src/utils/video-player-handoff";
import * as replacement from "../src/utils/video-source-replacement";
import { BoundedLruSet } from "../src/utils/bounded-lru";

const source = (name) => readFileSync(`src/components/molecules/${name}`, "utf8");
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness(nativePlayer) {
  const slots = [];
  let cursor = 0, dirty = false, effects = [], now = 0, nextTimer = 0;
  const timers = new Map();
  const schedule = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; };
  const cancel = (id) => timers.delete(id);
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    memo: (component) => component,
    useSyncExternalStore: (_, snapshot) => snapshot(),
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (next) => { const value = typeof next === "function" ? next(slots[i]) : next; if (!Object.is(slots[i], value)) dirty = true; slots[i] = value; }];
    },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) effects.push({ i, deps, callback, cleanup: slots[i]?.cleanup });
    },
  };
  react.useLayoutEffect = react.useEffect;
  const listeners = new Set();
  const AppState = { currentState: "active", addEventListener: (_, cb) => { listeners.add(cb); return { remove: () => listeners.delete(cb) }; } };
  let manifestReady = false;
  const modules = {
    react,
    "react-native": { AppState, Platform: { OS: "ios" }, View: "View", Pressable: "Pressable", StyleSheet: { create: (v) => v } },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "@/src/components/ui/primitives": { Text: "Text" },
    "@/src/hooks/use-video-player-controller": { useVideoPlayerLeaseVersion: ownership.getVideoPlayerLeaseVersion },
    "@/src/utils/video-player-handoff": ownership,
    "@/src/utils/video-source-replacement": replacement,
    "@/src/utils/video-recovery": { createVideoRecovery: (options) => createVideoRecovery({ ...options, schedule, cancel }) },
    "./post-card-utils": { isHostedStreamVideoUrl: (uri) => uri.includes("hosted") },
    "@/src/utils/hls-manifest": { HLS_PROCESSING_POLL_INTERVAL_MS: 3000, isHlsManifestReady: async () => manifestReady },
    "@/src/utils/bounded-lru": { BoundedLruSet },
  };
  const load = (name) => {
    const exports = {};
    const compiled = ts.transpileModule(source(name), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function("require", "exports", "setTimeout", "clearTimeout", "Date", compiled)((id) => {
      if (!(id in modules)) throw new Error(`Missing module ${id}`);
      return modules[id];
    }, exports, schedule, cancel, { now: () => now });
    return exports;
  };
  modules["./use-video-playback-intent"] = load("use-video-playback-intent.ts");
  const hook = load("use-video-source-recovery.ts").useVideoSourceRecovery;
  modules["./use-video-source-recovery"] = { useVideoSourceRecovery: hook };
  if (nativePlayer) {
    const position = { getPosition: () => 0, setPosition: () => {} };
    Object.assign(modules, {
      "@sentry/react-native": { addBreadcrumb: () => {} },
      "expo-video": { VideoView: "VideoView", useVideoPlayer: (_, setup) => {
        const ref = react.useRef(null);
        if (!ref.current) { ref.current = nativePlayer; setup(nativePlayer); }
        return ref.current;
      } },
      "expo-image": { Image: "Image" },
      "@expo/vector-icons": { Ionicons: "Ionicons" },
      "@/src/stores": {
        useIsFeedScrolling: () => false,
        useVideoMuteStore: (select) => select({ isMuted: true, toggleMute: () => {} }),
        useVideoPositionStore: Object.assign((select) => select(position), { getState: () => position }),
        buildVideoPositionKey: (uri) => uri,
      },
      "@/src/utils/video-asset-id": { canonicalVideoAssetId: (uri) => uri },
      "@/src/utils/video-ttff": { clearVideoPrepareMark: () => {}, markVideoPrepareStart: () => {}, markVideoFirstFrame: () => {} },
      "./post-card-media-constants": { MEDIA_LOADED_CACHE: new Set() },
      "./use-video-foreground-recovery": { useVideoForegroundRecovery: () => {} },
      "./media-image-policy": { getMediaImagePolicy: () => ({}), getMediaImageSource: () => null },
      "./video-unavailable-overlay": { VideoUnavailableOverlay: "VideoUnavailableOverlay" },
      "./media-gallery-shared": { GALLERY_LOADED_CACHE: new Set(), GALLERY_ASPECT_RATIO_CACHE: new Map(), galleryStyles: {} },
    });
    modules["./post-card-utils"].getVideoThumbnailUri = () => "https://cdn/poster.jpg";
    modules["@/src/hooks/use-video-player-controller"] = load("../../hooks/use-video-player-controller.ts");
  }
  return {
    hook, load,
    render(component, props) {
      let result, iterations = 0;
      do {
        dirty = false; cursor = 0; effects = [];
        result = component(props);
        const pending = effects;
        for (const e of pending) e.cleanup?.();
        for (const e of pending) slots[e.i] = { deps: e.deps, cleanup: e.callback() };
        if (++iterations > 25) throw new Error("Render loop");
      } while (dirty);
      return result;
    },
    async advance(ms) {
      await flush();
      now += ms;
      const due = [...timers.entries()].filter(([, value]) => value.at <= now);
      for (const [id, value] of due) if (timers.delete(id)) value.callback();
      await flush();
    },
    state(state) { AppState.currentState = state; for (const cb of listeners) cb(state); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    get timerCount() { return timers.size; },
    set manifestReady(value) { manifestReady = value; },
  };
}

function player(uri = "https://cdn/video.mp4") {
  const listeners = new Map();
  const calls = [];
  const value = {
    status: "readyToPlay", currentTime: 12, playing: true, availableVideoTracks: [],
    replaceAsync: async (source) => { calls.push(source); value.status = "readyToPlay"; },
    play: () => { value.playing = true; }, pause: () => { value.playing = false; },
    addListener(name, cb) { const list = listeners.get(name) ?? new Set(); listeners.set(name, list); list.add(cb); return { remove: () => list.delete(cb) }; },
    emit(name, payload) { if (name === "statusChange") value.status = payload.status; for (const cb of listeners.get(name) ?? []) cb(payload); },
    calls,
  };
  ownership.setAppliedVideoSourceUri(value, uri);
  return value;
}
const options = (p, extra = {}) => ({ uri: "https://cdn/video.mp4", player: p, enabled: true, shouldPlay: true, ...extra });

function feedPlayback(h) {
  const { usePostCardVideoPlayback } = h.load("use-post-card-video-playback.ts");
  const { usePostCardVideoListeners } = h.load("use-post-card-video-listeners.ts");
  const updateMediaAspectRatioFromSize = () => {};
  return (props) => {
    const playback = usePostCardVideoPlayback(props);
    usePostCardVideoListeners({ playback, resolvedMediaUri: props.media.uri, isPostDetail: false, updateMediaAspectRatioFromSize });
    const recovery = h.hook({ uri: props.media.uri, player: playback.videoPlayer, enabled: playback.shouldPrepareNativeVideo && props.screenActive, shouldPlay: playback.shouldPlayNativeVideo });
    return { ...playback, recovery };
  };
}
const feedProps = () => ({ media: { uri: "https://cdn/video.mp4", type: "video" }, isVisible: true, isFocused: true, isNearVisible: true, screenActive: true, shouldBlurContent: false, allowAutoplay: true, isPostDetail: false, shouldPrimeOptimisticVideo: false });
function nodes(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  const children = [tree.props?.children].flat(Infinity);
  return [...(tree.type === type ? [tree] : []), ...children.flatMap((child) => nodes(child, type))];
}

describe("feed autoplay runtime", () => {
  test("eligible single feed video starts muted before first frame without a click", async () => {
    const p = player(), h = harness(p), component = feedPlayback(h), props = feedProps();
    p.playing = false;
    let r = h.render(component, props);
    await flush(); r = h.render(component, props);
    expect(r.shouldPlayNativeVideo).toBe(true);
    expect(p.playing).toBe(true);
    expect(p.muted).toBe(true);
    expect(r.recovery.phase).toBe("loading");
    p.status = "loading";
    expect(r.recovery.firstFrame()).toBe(true);
    expect(h.render(component, props).recovery.phase).toBe("playable");
    await h.advance(60000);
    expect(p.calls).toHaveLength(1);
    h.unmount();
  });

  test("single feed ready event honors viewport, autoplay preference, blur, and background", async () => {
    const p = player(), h = harness(p), component = feedPlayback(h), props = feedProps();
    h.render(component, props); await flush();
    for (const blocked of [{ isVisible: false, isFocused: false }, { allowAutoplay: false }, { shouldBlurContent: true }, { screenActive: false }]) {
      const next = { ...props, ...blocked };
      const r = h.render(component, next);
      p.emit("statusChange", { status: "readyToPlay" });
      expect(r.shouldPlayNativeVideo).toBe(false);
      expect(p.playing).toBe(false);
      h.render(component, props);
      p.emit("statusChange", { status: "readyToPlay" });
      expect(p.playing).toBe(true);
    }
    h.unmount();
  });

  test("single feed ready events do not steal a detail lease", async () => {
    const p = player(), h = harness(p), component = feedPlayback(h), props = feedProps();
    h.render(component, props); await flush();
    const lease = ownership.adoptHandoffPlayer(props.media.uri, props.media.uri);
    expect(lease).not.toBeNull();
    h.render(component, props);
    p.playing = false;
    p.emit("statusChange", { status: "readyToPlay" });
    expect(p.playing).toBe(false);
    ownership.releaseHandoffPlayer(lease);
    h.render(component, props);
    expect(p.playing).toBe(true);
    h.unmount();
  });

  test("returning fullscreen lease preserves explicit pause and current position in mounted feed", async () => {
    const p = player(), h = harness(p), component = feedPlayback(h), props = feedProps();
    h.render(component, props); await flush();
    const lease = ownership.adoptHandoffPlayer(props.media.uri, props.media.uri);
    h.render(component, { ...props, screenActive: false });
    p.currentTime = 48;
    ownership.setVideoPlaybackIntent(p, false);
    p.pause();
    ownership.releaseHandoffPlayer(lease);
    const result = h.render(component, props);
    expect(result.videoPlayer).toBe(p);
    expect(result.isVideoPlaying).toBe(false);
    expect(p.playing).toBe(false);
    expect(p.currentTime).toBe(48);
    h.unmount();
  });

  test("selected gallery starts before first frame; adjacent and offscreen items pause", async () => {
    const p = player(), h = harness(p), { GalleryVideoItem } = h.load("gallery-video-item.tsx");
    const props = { item: feedProps().media, width: 300, height: 200, isActive: true, screenActive: true, allowAutoplay: true, isVisible: true, isFocused: true, shouldPrepare: true };
    p.playing = false;
    h.render(GalleryVideoItem, props); await flush();
    let tree = h.render(GalleryVideoItem, props);
    expect(p.playing).toBe(true); expect(p.muted).toBe(true);
    expect(nodes(tree, "Image")).toHaveLength(1);
    p.status = "loading";
    nodes(tree, "VideoView")[0].props.onFirstFrameRender();
    tree = h.render(GalleryVideoItem, props);
    expect(nodes(tree, "Image")).toHaveLength(0);
    for (const blocked of [{ isActive: false }, { isVisible: false }, { screenActive: false }]) {
      h.render(GalleryVideoItem, { ...props, ...blocked });
      p.emit("statusChange", { status: "readyToPlay" });
      expect(p.playing).toBe(false);
      h.render(GalleryVideoItem, props);
      expect(p.playing).toBe(true);
    }
    const oldFrame = nodes(tree, "VideoView")[0].props.onFirstFrameRender;
    const recycled = { ...props, item: { ...props.item, uri: "https://cdn/recycled.mp4" } };
    h.render(GalleryVideoItem, recycled); await flush();
    oldFrame();
    tree = h.render(GalleryVideoItem, recycled);
    expect(nodes(tree, "Image")).toHaveLength(1);
    nodes(tree, "VideoView")[0].props.onFirstFrameRender();
    expect(nodes(h.render(GalleryVideoItem, recycled), "Image")).toHaveLength(0);
    h.unmount();
  });

  test("gallery never starts when autoplay policy is disabled", async () => {
    const p = player(), h = harness(p), { GalleryVideoItem } = h.load("gallery-video-item.tsx");
    const props = { item: feedProps().media, width: 300, height: 200, isActive: true, screenActive: true, allowAutoplay: false, isVisible: true, shouldPrepare: true };
    p.playing = false;
    h.render(GalleryVideoItem, props); await flush();
    p.emit("statusChange", { status: "readyToPlay" });
    expect(p.playing).toBe(false);
    h.unmount();
  });
});

describe("video source recovery runtime", () => {
  test("native first frame while status is loading reveals media and cancels the watchdog", async () => {
    const h = harness(), p = player(), props = options(p);
    p.status = "loading";
    const r = h.render(h.hook, props);
    expect(r.firstFrame()).toBe(true);
    expect(h.render(h.hook, props).phase).toBe("playable");
    p.emit("statusChange", { status: "readyToPlay" });
    await h.advance(60000);
    expect(p.calls).toHaveLength(0);
    expect(h.render(h.hook, props).phase).toBe("playable");
    h.unmount();
  });

  test("optional track warnings and metadata-ready are not playback failure or first frame", () => {
    const h = harness(), p = player(), props = options(p);
    let r = h.render(h.hook, props);
    p.emit("availableAudioTracksChange", { error: new Error("track enumeration failed") });
    p.emit("sourceLoad", { videoSource: props.uri, availableVideoTracks: [] });
    p.emit("statusChange", { status: "readyToPlay" });
    r = h.render(h.hook, props);
    expect(r.phase).toBe("loading");
    expect(p.calls).toHaveLength(0);
    expect(r.firstFrame()).toBe(true);
    expect(h.render(h.hook, props).phase).toBe("playable");
    h.unmount();
  });

  test("actual errors have two automatic retries, terminal UI state, and manual episode reset", async () => {
    const h = harness(), p = player(), props = options(p);
    h.render(h.hook, props);
    for (const delay of [1000, 2000]) {
      p.emit("statusChange", { status: "error", error: { message: "connection refused" } });
      h.render(h.hook, props);
      await h.advance(delay);
      h.render(h.hook, props);
    }
    p.emit("statusChange", { status: "error", error: { message: "connection refused" } });
    let r = h.render(h.hook, props);
    expect(r.phase).toBe("terminal");
    expect(p.calls).toHaveLength(2);
    await h.advance(60000);
    expect(p.calls).toHaveLength(2);
    r.retry(); await flush();
    r = h.render(h.hook, props);
    expect(r.phase).toBe("loading");
    expect(p.calls[2]).toEqual({ uri: props.uri, useCaching: true });
    expect(p.currentTime).toBe(12);
    p.emit("statusChange", { status: "error" });
    await h.advance(1000);
    expect(p.calls).toHaveLength(4);
    h.unmount();
  });

  test("replaceAsync rejection from initial controller load uses the same bounded budget", async () => {
    const h = harness(), p = player(), props = options(p);
    let count = 0;
    p.replaceAsync = async () => { count++; throw new Error("native connection error"); };
    h.render(h.hook, props);
    await replacement.replaceVideoPlayerSourceAsync(p, props.uri).catch(() => {});
    h.render(h.hook, props);
    await h.advance(1000); h.render(h.hook, props);
    await h.advance(2000);
    expect(h.render(h.hook, props).phase).toBe("terminal");
    expect(count).toBe(3);
    h.unmount();
  });

  test("only explicit permanent HTTP status is terminal immediately", () => {
    const h = harness(), p = player(), props = options(p);
    h.render(h.hook, props);
    p.emit("statusChange", { status: "error", error: { status: 410 } });
    expect(h.render(h.hook, props).phase).toBe("terminal");
    expect(p.calls).toHaveLength(0);
    h.unmount();
  });

  test("loading frames cannot revive terminal failures; idle and error frames remain rejected", async () => {
    const h = harness(), p = player(), props = options(p);
    let r = h.render(h.hook, props);
    for (const status of ["idle", "error"]) {
      p.status = status;
      expect(r.firstFrame()).toBe(false);
    }
    p.emit("statusChange", { status: "error", error: { status: 410 } });
    r = h.render(h.hook, props);
    p.status = "loading";
    expect(r.firstFrame()).toBe(false);
    h.render(h.hook, { ...props, enabled: false });
    r = h.render(h.hook, props);
    await h.advance(60000);
    expect(r.phase).toBe("terminal");
    expect(p.calls).toHaveLength(0);
    r.retry(); await flush();
    r = h.render(h.hook, props);
    p.status = "loading";
    expect(r.firstFrame()).toBe(true);
    expect(h.render(h.hook, props).phase).toBe("playable");
    h.unmount();
  });

  test("stale callbacks after source recycling or retry cannot mark the new source playable", async () => {
    const h = harness(), p = player(), props = options(p);
    const old = h.render(h.hook, props);
    const next = { ...props, uri: "https://cdn/new.mp4" };
    h.render(h.hook, next);
    p.emit("statusChange", { status: "error" });
    expect(h.render(h.hook, next).phase).toBe("loading");
    ownership.setAppliedVideoSourceUri(p, next.uri); p.status = "readyToPlay";
    expect(old.firstFrame()).toBe(false);
    let r = h.render(h.hook, next);
    const beforeRetry = r.firstFrame;
    r.retry(); await flush();
    r = h.render(h.hook, next);
    expect(beforeRetry()).toBe(false);
    expect(r.firstFrame()).toBe(true);
    expect(h.render(h.hook, next).phase).toBe("playable");
    h.unmount();
  });

  test("background and eligibility cancel timers without replenishing exhausted budget", async () => {
    const h = harness(), p = player(), props = options(p);
    h.render(h.hook, props);
    p.emit("statusChange", { status: "error" });
    h.render(h.hook, props);
    h.state("background"); h.render(h.hook, props);
    expect(h.timerCount).toBe(0);
    await h.advance(60000); expect(p.calls).toHaveLength(0);
    h.state("active"); h.render(h.hook, props);
    await h.advance(1000); h.render(h.hook, props);
    p.emit("statusChange", { status: "error" });
    h.render(h.hook, { ...props, enabled: false });
    await h.advance(60000); expect(p.calls).toHaveLength(1);
    h.render(h.hook, props); await h.advance(2000);
    p.emit("statusChange", { status: "error" });
    expect(h.render(h.hook, props).phase).toBe("terminal");
    h.state("background"); h.render(h.hook, props);
    h.state("active"); h.render(h.hook, props); await h.advance(60000);
    expect(p.calls).toHaveLength(2);
    h.unmount(); expect(h.timerCount).toBe(0);
  });

  test("a newer fullscreen lease blocks retry, ready/frame handling and late async writes", async () => {
    const h = harness(), p = player(), props = options(p);
    ownership.offerHandoffPlayer("recovery-test", p);
    const detail = ownership.adoptHandoffPlayer("recovery-test", props.uri);
    const detailProps = { ...props, lease: detail };
    let r = h.render(h.hook, detailProps);
    const fullscreen = ownership.adoptHandoffPlayer("recovery-test", props.uri);
    h.render(h.hook, detailProps);
    r.retry(); expect(r.firstFrame()).toBe(false);
    p.emit("statusChange", { status: "error" }); await h.advance(2000);
    expect(p.calls).toHaveLength(0);
    ownership.releaseHandoffPlayer(fullscreen); p.status = "readyToPlay";
    r = h.render(h.hook, detailProps);
    let resolve;
    p.replaceAsync = () => new Promise((done) => { resolve = done; });
    r.retry(); await flush();
    h.state("background"); h.render(h.hook, detailProps);
    p.currentTime = 99; p.playing = false;
    resolve(); await flush();
    expect(p.currentTime).toBe(99); expect(p.playing).toBe(false);
    h.unmount(); ownership.releaseHandoffPlayer(detail); ownership.revokeHandoffOffer("recovery-test", p);
  });

  test("unmount drops pending replacement rejection and all callbacks", async () => {
    const h = harness(), p = player(), props = options(p);
    let reject;
    p.replaceAsync = () => new Promise((_, fail) => { reject = fail; });
    const r = h.render(h.hook, props);
    r.retry(); await flush(); h.unmount();
    reject(new Error("late")); await flush();
    expect(r.firstFrame()).toBe(false);
    expect(h.timerCount).toBe(0);
  });

  test("confirmed processing reaches explicit unavailable at the deadline, then manual retry restarts polling", async () => {
    const h = harness(), uri = "https://hosted/video.m3u8", p = player(uri);
    const { usePostCardVideoHealth: health, VIDEO_PROCESSING_POLL_MAX_MS } = h.load("use-post-card-video-health.ts");
    let completed = 0;
    const props = { media: { uri, type: "video" }, videoPlayer: p, adoptedLease: null, enabled: true, shouldPlay: true, forceVideoProcessing: true, onVideoProcessingComplete: () => completed++ };
    expect(h.render(health, props).showVideoProcessing).toBe(true);
    await flush(); await h.advance(VIDEO_PROCESSING_POLL_MAX_MS);
    let r = h.render(health, props);
    expect(r.videoError).toBe(true); expect(r.showVideoProcessing).toBe(false);
    r.retry(); await flush();
    r = h.render(health, props);
    expect(r.showVideoProcessing).toBe(true);
    h.manifestReady = true;
    await h.advance(3000); await flush();
    r = h.render(health, props);
    expect(r.showVideoProcessing).toBe(false); expect(completed).toBe(1);
    h.unmount();
  });

  test("CDN outage is not upload processing and metadata alone never fills loaded caches", async () => {
    const h = harness(), uri = "https://hosted/video.m3u8", p = player(uri);
    const { usePostCardVideoHealth: health } = h.load("use-post-card-video-health.ts");
    const props = { media: { uri, type: "video" }, videoPlayer: p, adoptedLease: null, enabled: true, shouldPlay: true, forceVideoProcessing: false };
    h.render(health, props);
    p.emit("statusChange", { status: "error", error: { message: "connection refused" } });
    expect(h.render(health, props).showVideoProcessing).toBe(false);
    for (const name of ["gallery-video-item.tsx", "media-preview-video-item.tsx", "media-preview-modal.tsx"]) {
      expect(source(name)).toContain("VideoUnavailableOverlay");
      expect(source(name)).not.toContain("8000");
    }
    h.unmount();
  });

  test("metadata without a first frame times out through the same two retries", async () => {
    const h = harness(), p = player(), props = options(p);
    h.render(h.hook, props);
    for (const delay of [1000, 2000]) {
      await h.advance(15000); h.render(h.hook, props);
      await h.advance(delay); h.render(h.hook, props);
      p.emit("statusChange", { status: "readyToPlay" });
    }
    await h.advance(15000);
    expect(h.render(h.hook, props).phase).toBe("terminal");
    expect(p.calls).toHaveLength(2);
    h.unmount();
  });

  test("queued Retry stands down when fullscreen adopts before native execution", async () => {
    const h = harness(), p = player(), props = options(p);
    ownership.offerHandoffPlayer("queued-recovery", p);
    const r = h.render(h.hook, props);
    r.retry();
    const fullscreen = ownership.adoptHandoffPlayer("queued-recovery", props.uri);
    await flush();
    expect(p.calls).toHaveLength(0);
    ownership.releaseHandoffPlayer(fullscreen);
    ownership.setAppliedVideoSourceUri(p, "https://cdn/recycled.mp4");
    r.retry(); await flush();
    expect(p.calls).toHaveLength(0);
    expect(r.firstFrame()).toBe(false);
    h.unmount(); ownership.revokeHandoffOffer("queued-recovery", p);
  });

  test("processing background cancellation retains its original deadline", async () => {
    const h = harness(), uri = "https://hosted/background.m3u8", p = player(uri);
    const { usePostCardVideoHealth: health } = h.load("use-post-card-video-health.ts");
    const props = { media: { uri, type: "video" }, videoPlayer: p, adoptedLease: null, enabled: true, shouldPlay: true, forceVideoProcessing: true };
    h.render(health, props); await flush();
    h.state("background"); h.render(health, props);
    expect(h.timerCount).toBe(0);
    await h.advance(300000);
    h.state("active"); h.render(health, props); await h.advance(0);
    expect(h.render(health, props).videoError).toBe(true);
    h.unmount();
  });

  test("fallback Retry is accessible, consumes the press, and retains outer geometry", () => {
    const h = harness();
    const { VideoUnavailableOverlay } = h.load("video-unavailable-overlay.tsx");
    let retries = 0, stopped = 0;
    const tree = VideoUnavailableOverlay({ visible: true, onRetry: () => retries++ });
    const button = tree.props.children[1];
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Retry video");
    button.props.onPress({ stopPropagation: () => stopped++ });
    expect(retries).toBe(1); expect(stopped).toBe(1);
    expect(tree.props.style.position).toBe("absolute");
    expect(source("post-card-video.tsx")).not.toContain("if (shouldHideOnError) return null");
  });
});
