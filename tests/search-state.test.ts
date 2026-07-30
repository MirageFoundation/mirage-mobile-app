// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildSearchDiscoverySections,
  getSearchTabCounts,
  normalizeSearchQuery,
  resolveSearchTab,
  selectTrendingTopics,
  shouldShowSearchResults,
} from "../src/pages/search/search-state";

const topic = (name: string, postCount?: number) => ({
  topic: name,
  post_count: postCount,
});

describe("search state mapping", () => {
  test("normalizes query and route tab values", () => {
    expect(normalizeSearchQuery("  bitcoin  ")).toBe("bitcoin");
    expect(normalizeSearchQuery(null)).toBe("");
    expect(resolveSearchTab("topics")).toBe("topics");
    expect(resolveSearchTab("unknown")).toBe("posts");
  });

  test("shows results only after a non-empty query has debounced", () => {
    expect(shouldShowSearchResults(" bitcoin ", null)).toBe(false);
    expect(shouldShowSearchResults(" bitcoin ", "bitcoin")).toBe(true);
    expect(shouldShowSearchResults("   ", "older-query")).toBe(false);
  });

  test("filters, sorts, and bounds trending topics without mutating input", () => {
    const topics = [
      topic("small", 2),
      topic("empty", 0),
      topic("largest", 20),
      topic("medium", 10),
    ];

    expect(selectTrendingTopics(topics, 2).map((item) => item.topic)).toEqual([
      "largest",
      "medium",
    ]);
    expect(topics.map((item) => item.topic)).toEqual([
      "small",
      "empty",
      "largest",
      "medium",
    ]);
  });

  test("maps bounded discovery sections with recent first and trending always present", () => {
    const recent = [{ id: "1", query: "btc", timestamp: 1 }];
    const trending = [topic("bitcoin", 10)];

    expect(buildSearchDiscoverySections(recent, trending, false)).toEqual([
      { key: "recent", items: recent },
      { key: "trending", items: trending, isLoading: false },
    ]);
    expect(buildSearchDiscoverySections([], [], true)).toEqual([
      { key: "trending", items: [], isLoading: true },
    ]);
  });

  test("maps tab counts to selected-topic posts when applicable", () => {
    const counts = {
      postCount: 3,
      topicCount: 4,
      topicPostCount: 8,
      userCount: 5,
    };

    expect(getSearchTabCounts({ ...counts, hasSelectedTopic: false })).toEqual({
      posts: 3,
      topics: 4,
      users: 5,
    });
    expect(getSearchTabCounts({ ...counts, hasSelectedTopic: true }).topics).toBe(
      8,
    );
  });
});
