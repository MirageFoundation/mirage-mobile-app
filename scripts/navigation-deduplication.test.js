import { describe, expect, test } from "bun:test";

import {
  buildNavigationDedupeKey,
  createNavigationDeduplicator,
  normalizeHrefForDeduplication,
} from "../src/navigation/navigation-deduplication.ts";

const createGuard = () => createNavigationDeduplicator(500);

describe("navigation deduplication", () => {
  test("allows different post IDs within the guard window", () => {
    const guard = createGuard();

    expect(
      guard.shouldSuppress("navigate", {
        pathname: "/post/[id]",
        params: { id: "post-1" },
      }, 1_000),
    ).toBe(false);
    expect(
      guard.shouldSuppress("navigate", {
        pathname: "/post/[id]",
        params: { id: "post-2" },
      }, 1_100),
    ).toBe(false);
  });

  test("does not drop a notification race to distinct params", () => {
    const guard = createGuard();

    expect(
      guard.shouldSuppress("navigate", {
        pathname: "/user/[id]",
        params: { id: "current-navigation" },
      }, 2_000),
    ).toBe(false);
    expect(
      guard.shouldSuppress("navigate", {
        pathname: "/user/[id]",
        params: { id: "notification-target" },
      }, 2_001),
    ).toBe(false);
  });

  test("suppresses identical duplicate taps for 500ms", () => {
    const guard = createGuard();
    const href = { pathname: "/post/[id]", params: { id: "post-1" } };

    expect(guard.shouldSuppress("push", href, 3_000)).toBe(false);
    expect(guard.shouldSuppress("push", href, 3_499)).toBe(true);
    expect(guard.shouldSuppress("push", href, 3_500)).toBe(false);
  });

  test("normalizes object key order recursively", () => {
    const first = {
      pathname: "/search",
      params: { filter: { sort: "new", topic: "tech" }, page: 2 },
    };
    const second = {
      params: { page: 2, filter: { topic: "tech", sort: "new" } },
      pathname: "/search",
    };

    expect(normalizeHrefForDeduplication(first)).toBe(
      normalizeHrefForDeduplication(second),
    );
  });

  test("preserves array order and primitive types", () => {
    const base = { pathname: "/search", params: { tags: ["one", "two"] } };
    const reordered = {
      pathname: "/search",
      params: { tags: ["two", "one"] },
    };
    const numeric = { pathname: "/search", params: { value: 1 } };
    const string = { pathname: "/search", params: { value: "1" } };

    expect(normalizeHrefForDeduplication(base)).not.toBe(
      normalizeHrefForDeduplication(reordered),
    );
    expect(normalizeHrefForDeduplication(numeric)).not.toBe(
      normalizeHrefForDeduplication(string),
    );
  });

  test("distinguishes undefined, null, absent, and encoded values", () => {
    const href = (value) => ({ pathname: "/search", params: { value } });
    const keys = [
      normalizeHrefForDeduplication(href(undefined)),
      normalizeHrefForDeduplication(href(null)),
      normalizeHrefForDeduplication({ pathname: "/search", params: {} }),
      normalizeHrefForDeduplication(href("hello%20world")),
      normalizeHrefForDeduplication(href("hello world")),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });

  test("keeps string href query values and action types in the key", () => {
    expect(normalizeHrefForDeduplication("/post?id=one&next=%2Fhome")).not.toBe(
      normalizeHrefForDeduplication("/post?id=two&next=%2Fhome"),
    );
    expect(buildNavigationDedupeKey("push", "/post?id=one")).not.toBe(
      buildNavigationDedupeKey("replace", "/post?id=one"),
    );
  });
});
