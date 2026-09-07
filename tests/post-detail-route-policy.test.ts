// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "android" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
}));

const {
  POST_DETAIL_HOME_ROUTE,
  POST_DETAIL_STACK_GESTURE_OPTIONS,
  resolvePostDetailExitAction,
} = await import("../src/navigation/post-detail-route-policy");

describe("post detail exit routing", () => {
  test("fullscreen is public and canonical post/comment aliases retain focus parameters", async () => {
    const { mapMiragePathToRoute, routeRequiresAuth } = await import("../src/navigation/route-map");
    expect(mapMiragePathToRoute("/post-media/p", "?index=2").route).toBe("/post-media/p?index=2");
    expect(routeRequiresAuth("/post-media/p?index=2")).toBe(false);
    for (const prefix of ["p", "post"]) {
      expect(mapMiragePathToRoute(`/${prefix}/p`, "?highlight=c&depth=3").route).toBe("/post/p?highlight=c&depth=3");
    }
    expect(mapMiragePathToRoute("/comment/c", "?highlight=r").route).toBe("/post/c?highlight=r&depth=5");
  });
  test("comment return intent is consumed without changing shared action overrides", async () => {
    const { usePostDetailActionStateStore } = await import("../src/stores/post-detail-action-state-store");
    const state = usePostDetailActionStateStore.getState();
    state.setPostFollowOverride("p", true);
    state.requestComments("p");
    expect(usePostDetailActionStateStore.getState().commentsRequestedFor).toBe("p");
    state.requestComments(null);
    expect(usePostDetailActionStateStore.getState().commentsRequestedFor).toBeNull();
    expect(usePostDetailActionStateStore.getState().postFollowOverrides.p).toBe(true);
    state.clearPostFollowOverride("p");
  });
  test("returns to the previous screen when the stack can go back", () => {
    expect(resolvePostDetailExitAction(true)).toBe("back");
  });

  test("replaces onto Home when post detail has no back stack", () => {
    expect(resolvePostDetailExitAction(false)).toBe("replace_home");
    expect(POST_DETAIL_HOME_ROUTE).toBe("/");
  });

  test("disables stack swipe-back so gallery and comment gestures cannot pop Home", () => {
    expect(POST_DETAIL_STACK_GESTURE_OPTIONS).toEqual({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
    });
  });
});
