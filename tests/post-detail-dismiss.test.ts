// @ts-nocheck -- Bun's test types are runtime-provided.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as policy from "../src/pages/post/post-detail-dismiss";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function runtime() {
  const callbacks = {};
  const config = {};
  const chain = new Proxy({}, { get: (_target, key) => (...args) => {
    if (String(key).startsWith("on")) callbacks[key] = args[0];
    else config[key] = args;
    return chain;
  } });
  const keyboard = { value: 0 };
  const native = {};
  const mocks = {
    react: { useMemo: (fn) => fn() },
    "react-native-gesture-handler": { Gesture: { Pan: () => chain, Native: () => native } },
    "react-native-keyboard-controller": { useReanimatedKeyboardAnimation: () => ({ height: keyboard }) },
    "react-native-reanimated": { useSharedValue: (value) => ({ value }), runOnJS: (fn) => fn },
    "./post-detail-dismiss": policy,
  };
  const compiled = ts.transpileModule(read("src/pages/post/use-post-detail-dismiss.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((id) => mocks[id], exports);
  const scrollY = { value: 0 };
  let backs = 0;
  let failed = false;
  let active = false;
  const gestures = exports.usePostDetailDismiss(scrollY, true, () => backs++);
  const state = {
    fail: () => { failed = true; },
    activate: () => { if (!failed) { active = true; callbacks.onStart(); } },
  };
  const touch = (x, y, pointers = 1) => ({ numberOfTouches: pointers, allTouches: [{ absoluteX: x, absoluteY: y }] });
  return {
    config, native, keyboard, scrollY, gestures,
    get backs() { return backs; },
    get failed() { return failed; },
    down() { failed = false; active = false; callbacks.onTouchesDown(touch(0, 0), state); },
    move(x, y, pointers = 1) { callbacks.onTouchesMove(touch(x, y, pointers), state); },
    end(x, y, velocityY = 0, success = true) {
      callbacks.onEnd({ translationX: x, translationY: y, velocityY }, success && active && !failed);
      callbacks.onFinalize();
    },
  };
}

describe("detail pull-to-back policy", () => {
  test("deliberate displacement or downward flick reuses fullscreen thresholds", () => {
    expect(policy.shouldDismissPostDetail(true, 0, 0, 0, 120, 0)).toBe(true);
    expect(policy.shouldDismissPostDetail(true, -30, 0, 0, 48, 900)).toBe(true);
    for (const [x, y, velocity] of [[0, 119, 0], [0, 47, 2000], [0, 48, 899], [120, 150, 2000], [0, -120, -1000]]) {
      expect(policy.shouldDismissPostDetail(true, 0, 0, x, y, velocity)).toBe(false);
    }
  });
  test("requires actual top at start and finish and a closed keyboard", () => {
    expect(policy.canStartPostDetailDismiss(0.1, 0)).toBe(false);
    expect(policy.shouldDismissPostDetail(false, 0, 0, 0, 200, 1000)).toBe(false);
    expect(policy.shouldDismissPostDetail(true, 1, 0, 0, 200, 1000)).toBe(false);
    expect(policy.shouldDismissPostDetail(true, 0, -1, 0, 200, 1000)).toBe(false);
  });
  test("horizontal, upward, multitouch and long-press starts fail without capture", () => {
    expect(policy.resolvePostDetailPull(0, 16, 1, 100)).toBe("wait");
    expect(policy.resolvePostDetailPull(0, 17, 1, 100)).toBe("activate");
    for (const args of [[13, 20, 1, 100], [0, -9, 1, 100], [0, 30, 2, 100], [0, 30, 1, 350]]) {
      expect(policy.resolvePostDetailPull(...args)).toBe("fail");
    }
  });
});

describe("detail gesture callback runtime", () => {
  test("top down exits exactly once, using simultaneous native scrolling", () => {
    const r = runtime();
    expect(r.config.simultaneousWithExternalGesture).toEqual([r.native]);
    r.down(); r.move(0, 20); r.move(0, 140); r.end(0, 140);
    expect(r.backs).toBe(1);
    r.down(); r.move(0, 140); r.end(0, 140);
    expect(r.backs).toBe(1);
  });
  test("short and cancelled pulls do not exit and a later valid pull works", () => {
    const r = runtime();
    r.down(); r.move(0, 20); r.end(0, 50);
    r.down(); r.move(0, 130); r.end(0, 130, 0, false);
    expect(r.backs).toBe(0);
    r.down(); r.move(0, 130); r.end(0, 130);
    expect(r.backs).toBe(1);
  });
  test("a pull that starts among comments cannot exit even after reaching top", () => {
    const r = runtime();
    r.scrollY.value = 300;
    r.down(); r.scrollY.value = 0; r.move(0, 150); r.end(0, 150);
    expect(r.failed).toBe(true);
    expect(r.backs).toBe(0);
  });
  test("media/seek guard, horizontal gestures, pinch and keyboard block exit", () => {
    for (const configure of [
      (r) => { r.gestures.blocked.value = true; },
      (r) => { r.move(20, 0); },
      (r) => { r.move(0, 20, 2); },
      (r) => { r.keyboard.value = -300; },
    ]) {
      const r = runtime(); r.down(); configure(r); r.move(0, 150); r.end(0, 150);
      expect(r.backs).toBe(0);
    }
  });
});

test("list integration preserves one list, retries, feed refresh, route and composer policies", () => {
  const list = read("src/pages/post/post-detail-comments-section.tsx");
  const sections = read("src/pages/post/post-detail-sections.tsx");
  const controller = read("src/pages/post/use-post-detail-controller.ts");
  const guard = read("src/components/ui/swipe-back-guard.tsx");
  const card = read("src/components/molecules/post-card.tsx");
  expect(list.match(/<Animated.FlatList/g)).toHaveLength(1);
  expect(list).not.toMatch(/RefreshControl|refreshControl|onRefresh/);
  expect(list).toContain("onRetry={onRetryComments}");
  expect(list).toContain("scrollY.value = event.contentOffset.y");
  expect(list).toContain("runOnJS(forwardScroll)(event)");
  expect(list).toContain("ListHeaderComponent={listHeader}");
  expect(list).toContain("onScrollToIndexFailed=");
  expect(read("src/pages/home/home-tabbed-feed.tsx")).toContain("<RefreshControl");
  expect(guard).toContain(".blocksExternalGesture(pan)");
  expect(guard).toContain(".simultaneousWithExternalGesture(native)");
  expect(guard).not.toContain("state.activate()");
  expect(card).toMatch(/<SwipeBackGuard nativeChild>\s*<View onLayout={onMediaLayout}>/);
  expect(card).toMatch(/<SwipeBackGuard>\s*<PostActions/);
  expect(card).toMatch(/<SwipeBackGuard nativeChild>\s*<View style={styles.body}>/);
  expect(sections.indexOf("</GestureDetector>")).toBeLessThan(sections.indexOf("<PostDetailCommentComposer"));
  expect(sections).toContain("onBack={onBack}");
  expect(sections).toContain("usePostDetailDismiss(controller.scroll.scrollY, isFocused && screenActive, onBack)");
  expect(controller).toContain("resolvePostDetailExitAction(router.canGoBack())");
  expect(controller).toContain("router.replace(POST_DETAIL_HOME_ROUTE)");
  const routePolicy = {};
  const compiledRoutePolicy = ts.transpileModule(read("src/navigation/post-detail-route-policy.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const home = read("src/navigation/startup-route-policy.ts").match(/STARTUP_HOME_ROUTE = "([^"]+)"/)[1];
  new Function("require", "exports", compiledRoutePolicy)(() => ({ STARTUP_HOME_ROUTE: home }), routePolicy);
  expect(routePolicy.resolvePostDetailExitAction(false)).toBe("replace_home");
  expect(routePolicy.resolvePostDetailExitAction(true)).toBe("back");
  expect(routePolicy.POST_DETAIL_HOME_ROUTE).toBe("/");
  expect(sections).toContain("getThreadReplyPolicy(");
  expect(sections).toContain("onRefetchAfterSuccess={controller.composer.refetchAfterSuccess}");
  expect(read("src/pages/post/use-post-detail-dismiss.ts")).not.toMatch(/draft|removePost|clear\(|withTiming|withSpring/);
});
