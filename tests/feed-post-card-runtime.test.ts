// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { createFeedPostCardRuntime } from "../src/pages/home/feed-post-card-runtime";

const config = (name: string, revealedPosts = new Set<string>()) => ({
  currentUserId: `${name}-user`,
  followedUsers: new Set<string>(),
  joinedCommunities: new Set<string>(),
  followUserOverrides: {},
  revealedPosts,
  shareServer: "mirage.talk" as const,
  allowAutoplay: true,
  active: true,
  handlers: {
    onPostPress: (postId: string) => calls.push(`${name}:${postId}`),
  },
});

const calls: string[] = [];

describe("feed post-card runtime isolation", () => {
  test("simultaneously mounted feeds retain independent handlers", () => {
    calls.length = 0;
    const home = createFeedPostCardRuntime(config("home"));
    const following = createFeedPostCardRuntime(config("following"));

    home.getState().handlers.onPostPress?.("post-1");
    following.getState().handlers.onPostPress?.("post-1");
    home.getState().handlers.onPostPress?.("post-2");

    expect(calls).toEqual([
      "home:post-1",
      "following:post-1",
      "home:post-2",
    ]);
  });

  test("reveal and video state remain owned by each feed", () => {
    const home = createFeedPostCardRuntime(config("home", new Set(["home-post"])));
    const topic = createFeedPostCardRuntime(config("topic", new Set(["topic-post"])));

    home.setVideoViewability(new Set(["home-post"]), "home-post");
    topic.setVideoViewability(new Set(["topic-post"]), "topic-post");

    expect(home.getState().revealedPosts.has("topic-post")).toBe(false);
    expect(topic.getState().revealedPosts.has("home-post")).toBe(false);
    expect(home.getState().activePostId).toBe("home-post");
    expect(topic.getState().activePostId).toBe("topic-post");
  });

  test("config updates do not overwrite another feed", () => {
    const home = createFeedPostCardRuntime(config("home"));
    const following = createFeedPostCardRuntime(config("following"));
    const updated = config("home-updated", new Set(["revealed"]));

    home.updateConfig(updated);

    expect(home.getState().currentUserId).toBe("home-updated-user");
    expect(home.getState().revealedPosts.has("revealed")).toBe(true);
    expect(following.getState().currentUserId).toBe("following-user");
    expect(following.getState().revealedPosts.size).toBe(0);
  });

  test("unmount disposal clears actions and ephemeral runtime state", () => {
    const runtime = createFeedPostCardRuntime(config("home", new Set(["post-1"])));
    runtime.setVideoViewability(new Set(["post-1"]), "post-1");
    runtime.dispose();

    expect(runtime.getState().handlers).toEqual({});
    expect(runtime.getState().revealedPosts.size).toBe(0);
    expect(runtime.getState().visiblePostIds.size).toBe(0);
    expect(runtime.getState().activePostId).toBeNull();
  });

  test("the global store no longer owns mounted feed contracts", async () => {
    const source = await Bun.file("src/stores/home-post-card-store.ts").text();
    for (const field of [
      "handlers",
      "revealedPosts",
      "followUserOverrides",
      "activeVideoPostIds",
      "visibleVideoPostIds",
      "activeFeedScreen",
      "setCardContext",
      "setHandlers",
    ]) {
      expect(source).not.toContain(field);
    }
  });
});
