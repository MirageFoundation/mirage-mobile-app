// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  FEED_MAX_PAGES,
  INBOX_MAX_PAGES,
  USER_POSTS_MAX_PAGES,
  getPreviousNumberedPageParam,
} from "../src/api/read/infinite-query-policy";
import { BoundedLruMap, BoundedLruSet } from "../src/utils/bounded-lru";

describe("bounded infinite query policy", () => {
  test("assigns explicit limits based on surface back-scroll needs", () => {
    expect(FEED_MAX_PAGES).toBe(8);
    expect(USER_POSTS_MAX_PAGES).toBe(6);
    expect(INBOX_MAX_PAGES).toBe(5);
    expect(FEED_MAX_PAGES).toBeGreaterThan(USER_POSTS_MAX_PAGES);
    expect(USER_POSTS_MAX_PAGES).toBeGreaterThan(INBOX_MAX_PAGES);
  });

  test("derives previous pages from server page numbers after eviction", () => {
    expect(getPreviousNumberedPageParam({ page: 5 })).toBe(4);
    expect(getPreviousNumberedPageParam({ page: 1 })).toBeUndefined();
    expect(getPreviousNumberedPageParam(undefined)).toBeUndefined();
  });
});

describe("bounded LRU collections", () => {
  test("evicts deterministically and reads update recency", () => {
    const evicted: string[] = [];
    const cache = new BoundedLruMap<string, number>(2, (key) => evicted.push(key));
    cache.set("a", 1).set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(evicted).toEqual(["b"]);
  });

  test("updates, deletes, and clears map entries", () => {
    const cache = new BoundedLruMap<string, number>(2);
    cache.set("a", 1).set("a", 2).set("b", 3);
    expect(cache.size).toBe(2);
    expect(cache.peek("a")).toBe(2);
    expect(cache.delete("a")).toBe(true);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  test("bounded sets update recency and support delete and clear", () => {
    const cache = new BoundedLruSet<string>(2);
    cache.add("a").add("b");
    expect(cache.has("a")).toBe(true);
    cache.add("c");
    expect(cache.has("b")).toBe(false);
    expect(cache.delete("a")).toBe(true);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
