// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
}));

const { isAppRoute } = await import("../src/navigation/route-map");

describe("isAppRoute segment-boundary matching", () => {
  const accepted = [
    ["/(tabs)", true],
    ["/(tabs)/", true],
    ["/(tabs)/following", true],
    ["/(tabs)/inbox", true],
    ["/(tabs)/profile", true],
    ["/(tabs)/create", true],
    ["/(auth)/login", true],
    ["/(auth)/username", true],
    ["/(auth)/username?invite=abc", true],
    ["/p/post-id", true],
    ["/p/post-id?depth=5", true],
    ["/post/post-id", true],
    ["/user/user-id", true],
    ["/user/user-id/extra", true],
    ["/topic/topic-id", true],
    ["/user-following/user-id", true],
    ["/user-following/__SELF__", true],
    ["/search", true],
    ["/search/", true],
    ["/search?q=mirage", true],
    ["/search#results", true],
    ["/topics", true],
    ["/settings", true],
    ["/subscription", true],
    ["/agents", true],
    ["/invite-and-earn", true],
    ["/referrals", true],
    ["/blocked-list", true],
    ["/searching", false],
    ["/settings-extra", false],
    ["/subscriptions", false],
    ["/agents-x", false],
    ["/topics-list", false],
    ["/p/", false],
    ["/post/", false],
    ["/user/", false],
    ["/topic/", false],
    ["/user-following/", false],
    ["/(auth)/", false],
    ["/p//", false],
    ["/p//id", false],
    ["/user//id", false],
    ["/topic//slug", false],
    ["/post//abc", false],
    ["/user-following//self", false],
    ["/search%2Fextra", false],
    ["/settings%2Fextra", false],
    ["/p%2Fid", false],
    ["/post%2Fid", false],
    ["/user%2Fid", false],
    ["/topic%2Fslug", false],
    ["/(tabs)extra", false],
    ["/setting", false],
    ["/agent", false],
    ["/topic", false],
    ["/unknown", false],
    ["", false],
  ] as const;

  test.each(accepted)("isAppRoute(%s) => %s", (path, expected) => {
    expect(isAppRoute(path)).toBe(expected);
  });
});
