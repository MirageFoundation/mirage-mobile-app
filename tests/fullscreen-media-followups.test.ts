// @ts-nocheck -- Bun runtime test types.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { adoptHandoffPlayer, offerHandoffPlayer, releaseHandoffPlayer, revokeHandoffOffer, setAppliedVideoSourceUri, getAppliedVideoSourceUri, isVideoPlayerControlledElsewhere, setVideoPlaybackIntent, getVideoPlaybackIntent } from "../src/utils/video-player-handoff";
import { shouldDismissMedia } from "../src/utils/fullscreen-dismiss";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("fullscreen media followups", () => {
  test("rendered controls invoke play, mute, bounded seek and accessible adjustments", () => {
    const exports = {};
    const modules = {
      react: { useRef: (current) => ({ current }) },
      "react-native": { Pressable: "Pressable", Text: "Text", View: "View" },
      "@expo/vector-icons": { Ionicons: "Ionicons" },
      "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    };
    const compiled = ts.transpileModule(read("src/components/molecules/fullscreen-video-controls.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function("require", "exports", compiled)((id) => modules[id], exports);
    const calls = [];
    const tree = exports.FullscreenVideoControls({ playing: true, muted: true, position: 20, duration: 100, onPlayPause: () => calls.push("play"), onMute: () => calls.push("mute"), onSeek: (time) => calls.push(time) });
    const [play, seek, , mute] = tree.props.children;
    expect(play.props.accessibilityLabel).toBe("Pause video");
    expect(mute.props.accessibilityLabel).toBe("Unmute video");
    play.props.onPress(); mute.props.onPress();
    seek.props.onLayout({ nativeEvent: { layout: { width: 200 } } });
    expect(seek.props.onStartShouldSetResponder()).toBe(true);
    expect(seek.props.onResponderTerminationRequest()).toBe(false);
    seek.props.onResponderGrant({ nativeEvent: { locationX: 100 } });
    seek.props.onResponderMove({ nativeEvent: { locationX: 400 } });
    seek.props.onResponderMove({ nativeEvent: { locationX: -10 } });
    seek.props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } });
    expect(calls).toEqual(["play", "mute", 50, 100, 0, 30]);
  });
  test("feed/detail/fullscreen share identity and return current source without native writes", () => {
    const calls = [];
    const player = { status: "readyToPlay", currentTime: 42, muted: true, playing: true, replaceAsync: () => calls.push("replace"), play: () => calls.push("play"), release: () => calls.push("release") };
    const key = "post-a:gallery-2";
    setAppliedVideoSourceUri(player, "selected.m3u8");
    setVideoPlaybackIntent(player, true);
    offerHandoffPlayer(key, player);
    const detail = adoptHandoffPlayer(key, "selected.m3u8");
    const fullscreen = adoptHandoffPlayer(key, "selected.m3u8");
    expect(detail.player).toBe(player);
    expect(fullscreen.player).toBe(detail.player);
    expect(isVideoPlayerControlledElsewhere(player, detail)).toBe(true);
    expect(isVideoPlayerControlledElsewhere(player, fullscreen)).toBe(false);
    expect(adoptHandoffPlayer(key, "other-index.mp4")).toBeNull();
    expect(adoptHandoffPlayer("other-post:gallery-2", "selected.m3u8")).toBeNull();
    player.currentTime = 51;
    setVideoPlaybackIntent(player, false);
    releaseHandoffPlayer(fullscreen);
    releaseHandoffPlayer(fullscreen);
    expect(isVideoPlayerControlledElsewhere(player, null)).toBe(true);
    expect(isVideoPlayerControlledElsewhere(player, detail)).toBe(false);
    expect(getVideoPlaybackIntent(detail.player)).toBe(false);
    expect(detail.player.currentTime).toBe(51);
    expect(getAppliedVideoSourceUri(detail.player)).toBe("selected.m3u8");
    releaseHandoffPlayer(detail);
    expect(isVideoPlayerControlledElsewhere(player, null)).toBe(false);
    expect(calls).toEqual([]);
    revokeHandoffOffer(key, player);
    expect(adoptHandoffPlayer(key, "selected.m3u8")).toBeNull();
  });
  test("downward dismissal requires distance or a deliberate fast downward fling", () => {
    expect(shouldDismissMedia(0, 120, 0)).toBe(true);
    expect(shouldDismissMedia(8, 48, 900)).toBe(true);
    for (const args of [[0,119,0], [0,47,2000], [120,120,2000], [0,-200,2000], [100,40,2000]]) expect(shouldDismissMedia(...args)).toBe(false);
  });
  test("control targets are outside dismissal surface, zoom and horizontal gestures fail early", () => {
    const video = read("src/components/molecules/media-preview-video-item.tsx");
    const controls = read("src/components/molecules/fullscreen-video-controls.tsx");
    const gesture = read("src/components/molecules/use-media-dismiss-gesture.ts");
    expect(video.indexOf("</GestureDetector>")).toBeLessThan(video.indexOf("{playbackControls ? <FullscreenVideoControls"));
    expect(controls).toContain('accessibilityRole="adjustable"');
    expect(controls).toContain('"Pause video" : "Play video"');
    expect(controls).toContain("onResponderTerminationRequest={() => false}");
    expect(controls).toContain("height: 48");
    expect(gesture).toContain("scale.value > 1");
    expect(gesture).toContain("Math.abs(x) > 12 || y < -8");
    expect(gesture).toContain("withTiming(0");
    expect(read("src/components/molecules/post-card-video.tsx")).toContain("shouldMountNativeVideo && !playback.controlledElsewhere");
    expect(read("src/components/molecules/gallery-video-item.tsx")).toContain("shouldPrepare && !controlledElsewhere");
  });
});
