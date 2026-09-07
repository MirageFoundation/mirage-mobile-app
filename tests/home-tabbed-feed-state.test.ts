// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  FOLLOWING_AUTO_FILL_MAX_PAGES,
  createChainedTaskQueue,
  getHomeFeedContext,
  getLatestPostTimestamp,
  selectHomeFeedTab,
  shouldAutoFillFollowingFeed,
  shouldPrefetchNextPage,
  shouldShowNewPostsBanner,
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
    expect(shouldPrefetchNextPage(15, 20)).toBe(false);
    expect(shouldPrefetchNextPage(16, 20)).toBe(true);
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

  test("hides the New Posts banner unless Home or Following is focused", () => {
    expect(shouldShowNewPostsBanner(true, true)).toBe(true);
    expect(shouldShowNewPostsBanner(true, false)).toBe(false);
    expect(shouldShowNewPostsBanner(false, true)).toBe(false);
  });

  test("chains a New Posts refresh behind an in-flight pull-refresh", async () => {
    const enqueue = createChainedTaskQueue();
    const events: string[] = [];
    let secondSawFirstRunning = false;
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const first = enqueue(async () => {
      events.push("first-start");
      markFirstStarted();
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push("first-end");
    });
    const second = enqueue(async () => {
      secondSawFirstRunning = events.includes("first-start") && !events.includes("first-end");
      events.push("second");
    });

    await firstStarted;
    releaseFirst();
    await Promise.all([first, second]);
    expect(secondSawFirstRunning).toBe(false);
    expect(events).toEqual(["first-start", "first-end", "second"]);
  });
});
