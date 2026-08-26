// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  FOLLOWING_AUTO_FILL_MAX_PAGES,
  getHomeFeedContext,
  getLatestPostTimestamp,
  selectHomeFeedTab,
  shouldAutoFillFollowingFeed,
  shouldPrefetchNextPage,
} from "../src/pages/home/home-tabbed-feed-state";

describe("home tabbed feed state", () => {
  test("maps tabs to stable contexts and API sort values", () => {
    expect(selectHomeFeedTab(0)).toEqual({ key: "magic", querySort: "magic" });
    expect(selectHomeFeedTab(1)).toEqual({ key: "latest", querySort: "newest" });
    expect(getHomeFeedContext("home", 0)).toBe("home:magic");
    expect(getHomeFeedContext("following", 1)).toBe("following:latest");
  });

  test("reads the newest timestamp from the first hydrated page", () => {
    expect(getLatestPostTimestamp(undefined)).toBeNull();
    expect(getLatestPostTimestamp([])).toBeNull();
    expect(getLatestPostTimestamp([{ posts: [] }])).toBeNull();
    expect(getLatestPostTimestamp([{
      posts: [{ timestamp: 12 }, { timestamp: 41 }, { timestamp: 30 }],
    }])).toBe(41);
  });

  test("prefetches only after crossing the current-page threshold", () => {
    expect(shouldPrefetchNextPage(13, 20)).toBe(false);
    expect(shouldPrefetchNextPage(14, 20)).toBe(true);
    expect(shouldPrefetchNextPage(5, 8)).toBe(false);
    expect(shouldPrefetchNextPage(6, 8)).toBe(true);
  });

  test("bounds following-feed auto-fill when filtering keeps the feed sparse", () => {
    const ready = {
      renderedPostCount: 4,
      loadedPageCount: 1,
      hasNextPage: true,
      isFetching: false,
      isFetchingNextPage: false,
    };

    expect(shouldAutoFillFollowingFeed(ready)).toBe(true);
    expect(shouldAutoFillFollowingFeed({
      ...ready,
      loadedPageCount: FOLLOWING_AUTO_FILL_MAX_PAGES,
    })).toBe(false);
    expect(shouldAutoFillFollowingFeed({
      ...ready,
      renderedPostCount: 10,
    })).toBe(false);
    expect(shouldAutoFillFollowingFeed({
      ...ready,
      isFetchingNextPage: true,
    })).toBe(false);
  });
});
