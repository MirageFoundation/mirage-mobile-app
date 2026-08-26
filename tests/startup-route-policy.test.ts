// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "android" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
}));

const {
  isStartupHomePath,
  resolveInitialHomeAnchor,
  resolveStartupRouteAction,
} = await import("../src/navigation/startup-route-policy");

const readyLoggedIn = {
  isInitializing: false,
  isLoggedIn: true,
  hasSeenAdultPrompt: true,
};

describe("startup route policy", () => {
  test("always anchors a cold-start target on Home", () => {
    expect(resolveInitialHomeAnchor("/post/123?highlight=456")).toEqual({
      route: "/",
      pendingRoute: "/post/123?highlight=456",
    });
    expect(resolveInitialHomeAnchor("/inbox")).toEqual({
      route: "/",
      pendingRoute: "/inbox",
    });
    expect(resolveInitialHomeAnchor("/")).toEqual({
      route: "/",
      pendingRoute: null,
    });
  });

  test("recognizes only the Home anchor forms as startup Home", () => {
    expect(isStartupHomePath("/")).toBe(true);
    expect(isStartupHomePath("/(tabs)")).toBe(true);
    expect(isStartupHomePath("/(tabs)/")).toBe(true);
    expect(isStartupHomePath("/index")).toBe(true);
    expect(isStartupHomePath("/inbox")).toBe(false);
    expect(isStartupHomePath("/post/123")).toBe(false);
  });

  test("waits for auth before deciding any non-Home launch target", () => {
    expect(
      resolveStartupRouteAction("/post/123", {
        ...readyLoggedIn,
        isInitializing: true,
      }),
    ).toBe("wait_for_auth");
  });

  test("allows public post detail after auth resolution even when logged out", () => {
    expect(
      resolveStartupRouteAction("/post/123", {
        ...readyLoggedIn,
        isLoggedIn: false,
      }),
    ).toBe("push_screen");
  });

  test("retains protected targets while logged out", () => {
    expect(
      resolveStartupRouteAction("/inbox", {
        ...readyLoggedIn,
        isLoggedIn: false,
      }),
    ).toBe("auth_required");
  });

  test("waits for the authenticated onboarding prompt before protected routing", () => {
    expect(
      resolveStartupRouteAction("/inbox", {
        ...readyLoggedIn,
        hasSeenAdultPrompt: false,
      }),
    ).toBe("wait_for_adult_prompt");
  });

  test("navigates tabs and pushes stack screens after all startup gates", () => {
    expect(resolveStartupRouteAction("/inbox", readyLoggedIn)).toBe("navigate_tab");
    expect(resolveStartupRouteAction("/topic/mirage", readyLoggedIn)).toBe("push_screen");
  });
});
