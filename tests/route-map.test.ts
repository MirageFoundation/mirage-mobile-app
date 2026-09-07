// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
}));

const { isAppRoute, resolveMirageUrl } = await import("../src/navigation/route-map");

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
    ["/(auth)/username?ref=alice", true],
    ["/p/post-id", true],
    ["/p/post-id?depth=5", true],
    ["/post/post-id", true],
    ["/user/user-id", true],
    ["/user/user-id/extra", true],
    ["/c/news", true],
    ["/c/news?lens=raw", true],
    ["/c/news/teams", true],
    ["/curation-invitations", true],
    ["/creator-earnings", true],
    ["/topic/topic-id", false],
    ["/user-following/user-id", true],
    ["/user-following/__SELF__", true],
    ["/search", true],
    ["/search/", true],
    ["/search?q=mirage", true],
    ["/search#results", true],
    ["/communities", true],
    ["/topics", false],
    ["/settings", true],
    ["/subscription", true],
    ["/agents", false],
    ["/invite-and-earn", false],
    ["/referrals", false],
    ["/blocked-list", true],
    ["/searching", false],
    ["/settings-extra", false],
    ["/subscriptions", false],
    ["/agents-x", false],
    ["/topics-list", false],
    ["/p/", false],
    ["/post/", false],
    ["/user/", false],
    ["/c/", false],
    ["/topic/", false],
    ["/user-following/", false],
    ["/(auth)/", false],
    ["/p//", false],
    ["/p//id", false],
    ["/user//id", false],
    ["/c//slug", false],
    ["/topic//slug", false],
    ["/post//abc", false],
    ["/user-following//self", false],
    ["/search%2Fextra", false],
    ["/settings%2Fextra", false],
    ["/p%2Fid", false],
    ["/post%2Fid", false],
    ["/user%2Fid", false],
    ["/c%2Fslug", false],
    ["/topic%2Fslug", false],
    ["/(tabs)extra", false],
    ["/setting", false],
    ["/agent", false],
    ["/c", false],
    ["/topic", false],
    ["/unknown", false],
    ["", false],
  ] as const;

  test.each(accepted)("isAppRoute(%s) => %s", (path, expected) => {
    expect(isAppRoute(path)).toBe(expected);
  });
});

describe("shared profile and community deep links", () => {
  test("profile share URLs resolve to the target user, not self", () => {
    expect(resolveMirageUrl("https://mirage.talk/u/alice")).toEqual({
      type: "user",
      hostname: "mirage.talk",
      route: "/user/alice",
      requiresAuth: true,
      resourceId: "alice",
    });
    expect(resolveMirageUrl("https://mirage.talk/user/bob")).toMatchObject({
      type: "user",
      route: "/user/bob",
      resourceId: "bob",
    });
    expect(resolveMirageUrl("mirage://u/carol")).toMatchObject({
      type: "user",
      route: "/user/carol",
      resourceId: "carol",
    });
    expect(resolveMirageUrl("https://mirage.talk/u/alice")?.route).not.toContain("__SELF__");
    expect(resolveMirageUrl("https://mirage.talk/follows")?.route).toBe("/user-following/__SELF__");
  });

  test("community paths are exclusive and legacy topic routes 404", () => {
    expect(resolveMirageUrl("https://mirage.talk/c/news")).toEqual({
      type: "community",
      hostname: "mirage.talk",
      route: "/c/news",
      requiresAuth: false,
      resourceId: "news",
    });
    expect(resolveMirageUrl("https://mirage.talk/communities")).toMatchObject({
      type: "communities",
      route: "/communities",
      requiresAuth: false,
    });
    expect(resolveMirageUrl("https://mirage.talk/c/all")).toMatchObject({
      type: "notFound",
      route: "/_not-found",
    });
    expect(resolveMirageUrl("https://mirage.talk/c/home")).toMatchObject({
      type: "notFound",
      route: "/_not-found",
    });
    expect(resolveMirageUrl("https://mirage.talk/c/following")).toMatchObject({
      type: "notFound",
      route: "/_not-found",
    });
    expect(resolveMirageUrl("https://mirage.talk/t/news")).toMatchObject({
      type: "notFound",
      route: "/_not-found",
    });
    expect(resolveMirageUrl("https://mirage.talk/topic/news")).toMatchObject({
      type: "notFound",
      route: "/_not-found",
    });
    expect(resolveMirageUrl("https://mirage.talk/topics")).toMatchObject({
      type: "notFound",
      route: "/_not-found",
    });
  });

  test("comment and post aliases stay distinct from /c/:slug", () => {
    expect(resolveMirageUrl("https://mirage.talk/p/abc")).toMatchObject({
      type: "post",
      route: "/post/abc",
      resourceId: "abc",
    });
    expect(resolveMirageUrl("https://mirage.talk/comment/abc")).toEqual({
      type: "post",
      hostname: "mirage.talk",
      route: "/post/abc?depth=5",
      requiresAuth: false,
      resourceId: "abc",
    });
    expect(resolveMirageUrl("https://mirage.talk/comment/abc?foo=1")).toEqual({
      type: "post",
      hostname: "mirage.talk",
      route: "/post/abc?foo=1&depth=5",
      requiresAuth: false,
      resourceId: "abc",
    });
    expect(resolveMirageUrl("https://mirage.talk/c/abc")).toMatchObject({
      type: "community",
      route: "/c/abc",
      resourceId: "abc",
    });
    expect(resolveMirageUrl("https://mirage.talk/c/abc/teams")).toMatchObject({
      type: "community",
      route: "/c/abc/teams",
      requiresAuth: false,
      resourceId: "abc",
    });
    expect(resolveMirageUrl("https://mirage.talk/c/abc/teams/3")).toMatchObject({
      type: "community",
      route: "/c/abc/teams/3",
      requiresAuth: false,
      resourceId: "abc",
    });
    expect(resolveMirageUrl("https://mirage.talk/curation-invitations")).toMatchObject({
      type: "curationInvitations",
      route: "/curation-invitations",
      requiresAuth: true,
    });
    expect(resolveMirageUrl("https://mirage.talk/creator-earnings")).toMatchObject({
      type: "creatorEarnings",
      route: "/creator-earnings",
      requiresAuth: true,
    });
  });

  test("code-free signup aliases stay on username without invite or ref query", () => {
    expect(resolveMirageUrl("https://mirage.talk/signup?ref=alice")).toEqual({
      type: "signup",
      hostname: "mirage.talk",
      route: "/username",
      requiresAuth: false,
    });
    expect(resolveMirageUrl("https://mirage.talk/create_account")).toMatchObject({
      type: "signup",
      route: "/username",
      requiresAuth: false,
    });
  });

  test("retired feature and topic routes classify as native not-found", () => {
    for (const url of [
      "https://mirage.talk/agents",
      "https://mirage.talk/annotate",
      "https://mirage.talk/quests",
      "https://mirage.talk/referrals",
      "https://mirage.talk/invite-and-earn",
      "https://mirage.talk/t/news",
      "https://mirage.talk/topic/news",
      "https://mirage.talk/topics",
    ]) {
      expect(resolveMirageUrl(url)).toMatchObject({
        type: "notFound",
        route: "/_not-found",
        requiresAuth: false,
      });
    }
  });
});
