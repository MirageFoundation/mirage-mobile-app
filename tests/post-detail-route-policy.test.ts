// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "android" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
}));

const {
  MEDIA_POST_DETAIL_SWIPE_LEAVE,
  POST_DETAIL_HOME_ROUTE,
  POST_DETAIL_STACK_GESTURE_OPTIONS,
  isDeliberateMediaPostDetailSwipeDown,
  resolveMediaPostDetailSwipeDown,
  resolvePostDetailExitAction,
} = await import("../src/navigation/post-detail-route-policy");

describe("post detail exit routing", () => {
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

describe("media post detail swipe-down leave", () => {
  test("expands collapsed media instead of leaving", () => {
    expect(resolveMediaPostDetailSwipeDown(0.2)).toBe("expand");
    expect(resolveMediaPostDetailSwipeDown(1)).toBe("expand");
  });

  test("only leaves from the expanded media surface", () => {
    expect(resolveMediaPostDetailSwipeDown(0)).toBe("leave");
    expect(resolveMediaPostDetailSwipeDown(0.1)).toBe("leave");
  });

  test("ignores small interaction movement that previously kicked back to Home", () => {
    expect(isDeliberateMediaPostDetailSwipeDown(30, 400)).toBe(false);
    expect(isDeliberateMediaPostDetailSwipeDown(47, 1199)).toBe(false);
    expect(
      isDeliberateMediaPostDetailSwipeDown(
        MEDIA_POST_DETAIL_SWIPE_LEAVE.minTranslationY,
        0,
      ),
    ).toBe(true);
    expect(
      isDeliberateMediaPostDetailSwipeDown(
        MEDIA_POST_DETAIL_SWIPE_LEAVE.minTranslationForFling,
        MEDIA_POST_DETAIL_SWIPE_LEAVE.minVelocityY,
      ),
    ).toBe(true);
  });
});
