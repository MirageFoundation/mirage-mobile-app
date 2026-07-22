// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  getHomeFeedContext,
  getLatestPostTimestamp,
  selectHomeFeedTab,
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
});
