// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
}));

const {
  isAppRoute,
  isNotFoundRoute,
  isObsoleteMiragePath,
  NOT_FOUND_ROUTE,
  resolveMirageUrl,
  routeRequiresAuth,
} = await import("../src/navigation/route-map");
const { resolveStartupRouteAction } = await import("../src/navigation/startup-route-policy");

describe("retired route dispatch", () => {
  test("obsolete native paths are not app routes and do not require auth", () => {
    for (const path of [
      "/agents",
      "/annotate",
      "/quests",
      "/referrals",
      "/invite-and-earn",
      "/t/news",
      "/topic/1",
      "/topics",
      NOT_FOUND_ROUTE,
    ]) {
      expect(isObsoleteMiragePath(path) || isNotFoundRoute(path)).toBe(true);
      expect(isAppRoute(path)).toBe(false);
      expect(routeRequiresAuth(path)).toBe(false);
    }
  });

  test("trusted Mirage links for retired and unknown paths map to native not-found", () => {
    expect(resolveMirageUrl("https://mirage.talk/agents")).toMatchObject({
      type: "notFound",
      route: NOT_FOUND_ROUTE,
      requiresAuth: false,
    });
    expect(resolveMirageUrl("mirage://quests")).toMatchObject({
      type: "notFound",
      route: NOT_FOUND_ROUTE,
    });
    expect(resolveMirageUrl("https://mirage.talk/t/news")).toMatchObject({
      type: "notFound",
      route: NOT_FOUND_ROUTE,
    });
    expect(resolveMirageUrl("https://mirage.talk/unknown-path")).toMatchObject({
      type: "notFound",
      route: NOT_FOUND_ROUTE,
    });
    expect(resolveMirageUrl("https://example.com/agents")).toBeNull();
  });

  test("cold and pending not-found links dispatch without login or home rewrite", () => {
    expect(resolveStartupRouteAction(NOT_FOUND_ROUTE, {
      isInitializing: false,
      isLoggedIn: false,
      hasSeenAdultPrompt: false,
    })).toBe("push_screen");
    expect(resolveStartupRouteAction("/agents", {
      isInitializing: false,
      isLoggedIn: false,
      hasSeenAdultPrompt: false,
    })).toBe("push_screen");
    expect(resolveStartupRouteAction("/signup", {
      isInitializing: false,
      isLoggedIn: false,
      hasSeenAdultPrompt: false,
    })).not.toBe("push_screen");
  });

  test("code-free signup aliases remain distinct from not-found", () => {
    expect(resolveMirageUrl("https://mirage.talk/signup")).toMatchObject({
      type: "signup",
      route: "/username",
      requiresAuth: false,
    });
    expect(resolveMirageUrl("https://mirage.talk/create_account")).toMatchObject({
      type: "signup",
      route: "/username",
    });
    expect(NOT_FOUND_ROUTE).toBe("/_not-found");
  });
});
