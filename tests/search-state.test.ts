// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildSearchDiscoverySections,
  getSearchTabCounts,
  normalizeSearchQuery,
  recentSearchLabel,
  SEARCH_TABS,
  SEARCH_TAB_LABELS,
  resolveSearchTab,
  selectTrendingCommunities,
  shouldShowSearchResults,
} from "../src/pages/search/search-state";

const topic = (name: string, postCount?: number) => ({
  community: name,
  post_count: postCount,
});

describe("search state mapping", () => {
  test("labels the community tab without changing API tab keys", () => {
    expect(SEARCH_TABS.map((tab) => SEARCH_TAB_LABELS[tab])).toEqual([
      "Posts", "Communities", "Users",
    ]);
    expect(SEARCH_TABS[1]).toBe("communities");
  });

  test("displays explicit legacy community history without rewriting stored queries", () => {
    const item = { id: "legacy", query: "#Bitcoin", timestamp: 1 };
    expect(recentSearchLabel(item.query)).toBe("[bitcoin]");
    expect(item.query).toBe("#Bitcoin");
    expect(recentSearchLabel("[Bitcoin]")).toBe("[bitcoin]");
    for (const query of ["bitcoin", "@Bitcoin", "C#", "#bitcoin news", "text #bitcoin", "[a label]", "#bad--slug", "#home"]) {
      expect(recentSearchLabel(query)).toBe(query);
    }
  });

  test("normalizes query and route tab values", () => {
    expect(normalizeSearchQuery("  bitcoin  ")).toBe("bitcoin");
    expect(normalizeSearchQuery(null)).toBe("");
    expect(resolveSearchTab("communities")).toBe("communities");
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

    expect(selectTrendingCommunities(topics, 2).map((item) => item.community)).toEqual([
      "largest",
      "medium",
    ]);
    expect(topics.map((item) => item.community)).toEqual([
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
      communityCount: 4,
      communityPostCount: 8,
      userCount: 5,
    };

    expect(getSearchTabCounts({ ...counts, hasSelectedCommunity: false })).toEqual({
      posts: 3,
      communities: 4,
      users: 5,
    });
    expect(getSearchTabCounts({ ...counts, hasSelectedCommunity: true }).communities).toBe(
      8,
    );
  });
});
