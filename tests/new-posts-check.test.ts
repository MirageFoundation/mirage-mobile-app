// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  collectPostIdsFromPages,
  selectUnseenNewerPosts,
} from "../src/hooks/new-posts-check";

describe("new posts check", () => {
  test("collects ids from every loaded page", () => {
    expect(collectPostIdsFromPages([
      { posts: [{ post_id: "a" }, { post_id: "b" }] },
      { posts: [{ post_id: "c" }] },
    ])).toEqual(new Set(["a", "b", "c"]));
  });

  test("ignores posts already on the loaded feed even if they are newer", () => {
    expect(selectUnseenNewerPosts([
      { post_id: "cached", timestamp: 20 },
      { post_id: "fresh", timestamp: 30 },
    ], {
      baselineTimestamp: 10,
      knownPostIds: ["cached"],
    }).map((post) => post.post_id)).toEqual(["fresh"]);
  });

  test("does not flag an identical first page as new", () => {
    expect(selectUnseenNewerPosts([
      { post_id: "a", timestamp: 20 },
      { post_id: "b", timestamp: 10 },
    ], {
      baselineTimestamp: 20,
      knownPostIds: ["a", "b"],
    })).toEqual([]);
  });
});
