// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildFollowedTopicSet,
  isTopicFollowed,
  normalizeTopicName,
  toggleFollowedTopics,
} from "../src/domain/topics/follow";

// `get_topics` returns the original-cased topic ("Bitcoin"); a follow is always
// written lowercase, so `followed_topics` only ever contains "bitcoin".
describe("topic follow identity", () => {
  test("normalizes case and surrounding whitespace", () => {
    expect(normalizeTopicName("  Bitcoin ")).toBe("bitcoin");
    expect(normalizeTopicName(null)).toBe("");
    expect(normalizeTopicName(undefined)).toBe("");
  });

  test("matches a display-cased topic against the lowercase server list", () => {
    const followed = buildFollowedTopicSet(["bitcoin", "art"]);

    expect(isTopicFollowed(followed, "Bitcoin")).toBe(true);
    expect(isTopicFollowed(followed, "BITCOIN")).toBe(true);
    expect(isTopicFollowed(followed, "ethereum")).toBe(false);
  });

  test("works on a non-normalized screen-owned Set", () => {
    expect(isTopicFollowed(new Set(["Bitcoin"]), "bitcoin")).toBe(true);
  });

  test("works on the raw array form too", () => {
    expect(isTopicFollowed(["bitcoin"], "Bitcoin")).toBe(true);
    expect(isTopicFollowed([], "Bitcoin")).toBe(false);
    expect(isTopicFollowed(undefined, "Bitcoin")).toBe(false);
  });

  test("ignores empty topics", () => {
    expect(isTopicFollowed(buildFollowedTopicSet(["", "  "]), "")).toBe(false);
    expect(buildFollowedTopicSet(["", "  ", "art"]).size).toBe(1);
  });

  test("optimistic follow stores the name the server will return", () => {
    // Storing "Bitcoin" here is what made the button revert: the 5 s
    // consistency refetch replaced it with "bitcoin" and the membership check
    // stopped matching.
    expect(toggleFollowedTopics(["art"], "Bitcoin", true)).toEqual([
      "art",
      "bitcoin",
    ]);
  });

  test("optimistic follow never duplicates an existing entry", () => {
    expect(toggleFollowedTopics(["bitcoin"], "Bitcoin", true)).toEqual([
      "bitcoin",
    ]);
  });

  test("optimistic unfollow removes regardless of stored casing", () => {
    expect(toggleFollowedTopics(["Bitcoin", "art"], "bitcoin", false)).toEqual([
      "art",
    ]);
  });

  test("a follow round-trip keeps the button stable", () => {
    const displayTopic = "Bitcoin";
    let followedTopics: string[] = [];

    expect(isTopicFollowed(followedTopics, displayTopic)).toBe(false);

    // optimistic write
    followedTopics = toggleFollowedTopics(followedTopics, displayTopic, true);
    expect(isTopicFollowed(followedTopics, displayTopic)).toBe(true);

    // server response after the delayed consistency refetch
    followedTopics = ["bitcoin"];
    expect(isTopicFollowed(followedTopics, displayTopic)).toBe(true);
  });
});
