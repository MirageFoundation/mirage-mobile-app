// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { queryKeys } from "../src/api/read/query-keys";
import {
  isDebouncedSearchPending,
  normalizeSearchRequestQuery,
  normalizeTopicSearchQuery,
} from "../src/api/read/search-query";

describe("topic search query normalization", () => {
  test("lowercases uppercase topic input and trims whitespace", () => {
    expect(normalizeTopicSearchQuery("  Bitcoin ")).toBe("bitcoin");
    expect(normalizeTopicSearchQuery("BITCOIN")).toBe("bitcoin");
    expect(normalizeTopicSearchQuery(null)).toBe("");
    expect(normalizeTopicSearchQuery(undefined)).toBe("");
  });

  test("strips a leading # so dedicated topic search stays hash-free", () => {
    expect(normalizeTopicSearchQuery("#Bitcoin")).toBe("bitcoin");
    expect(normalizeTopicSearchQuery("  #BITCOIN  ")).toBe("bitcoin");
    expect(normalizeTopicSearchQuery("#")).toBe("");
  });

  test("unified topic search lowercases typed topics and #Topic prefixes", () => {
    expect(normalizeSearchRequestQuery("  Bitcoin ", "topics")).toBe("bitcoin");
    expect(normalizeSearchRequestQuery("#Bitcoin", "topics")).toBe("#bitcoin");
    expect(normalizeSearchRequestQuery("  #ETH  ")).toBe("#eth");
    expect(normalizeSearchRequestQuery("#")).toBe("");
  });

  test("does not lowercase user, post, or general full-text searches", () => {
    expect(normalizeSearchRequestQuery("  Hello World  ")).toBe("Hello World");
    expect(normalizeSearchRequestQuery("Hello World", "posts")).toBe("Hello World");
    expect(normalizeSearchRequestQuery("@Alice", "users")).toBe("@Alice");
    expect(normalizeSearchRequestQuery("Bitcoin", "users")).toBe("Bitcoin");
  });
});

describe("topic search query-key consistency", () => {
  test("dedicated topic keys collapse case, whitespace, and # prefixes", () => {
    expect(queryKeys.searchTopics("  Bitcoin ", 20, "sensitive")).toEqual(
      queryKeys.searchTopics("bitcoin", 20, "sensitive"),
    );
    expect(queryKeys.searchTopics("#BITCOIN", 20, "sensitive")).toEqual(
      queryKeys.searchTopics("bitcoin", 20, "sensitive"),
    );
  });

  test("unified topic keys match across mixed-case in-flight and follow-up queries", () => {
    const inFlight = queryKeys.search("Bitcoin", "topics", 20, "sensitive", undefined);
    const followUp = queryKeys.search("BITCOIN", "topics", 20, "sensitive", undefined);
    const hashed = queryKeys.search("#Bitcoin", undefined, 20, "sensitive", undefined);

    expect(inFlight).toEqual(followUp);
    expect(hashed).toEqual(
      queryKeys.search("#bitcoin", undefined, 20, "sensitive", undefined),
    );
    expect(inFlight).not.toEqual(hashed);
  });

  test("non-topic searches keep distinct keys when only case differs", () => {
    expect(queryKeys.search("Hello", "posts", 20, undefined, undefined)).not.toEqual(
      queryKeys.search("hello", "posts", 20, undefined, undefined),
    );
    expect(queryKeys.search("@Alice", "users", 20, undefined, undefined)).not.toEqual(
      queryKeys.search("@alice", "users", 20, undefined, undefined),
    );
    expect(queryKeys.search("Hello", undefined, 20, undefined, undefined)).not.toEqual(
      queryKeys.search("hello", undefined, 20, undefined, undefined),
    );
  });
});

describe("topic search debounce pending state", () => {
  test("does not stay pending when visible input only differs by case", () => {
    expect(
      isDebouncedSearchPending("Bitcoin", "bitcoin", normalizeTopicSearchQuery),
    ).toBe(false);
    expect(
      isDebouncedSearchPending("  BITCOIN  ", "bitcoin", normalizeTopicSearchQuery),
    ).toBe(false);
    expect(
      isDebouncedSearchPending("#Bitcoin", "bitcoin", normalizeTopicSearchQuery),
    ).toBe(false);
    expect(
      isDebouncedSearchPending(
        "Bitcoin",
        "bitcoin",
        (value) => normalizeSearchRequestQuery(value, "topics"),
      ),
    ).toBe(false);
    expect(
      isDebouncedSearchPending(
        "#Bitcoin",
        "#bitcoin",
        (value) => normalizeSearchRequestQuery(value),
      ),
    ).toBe(false);
  });

  test("stays pending for a different topic and clears on empty input", () => {
    expect(
      isDebouncedSearchPending("Ethereum", "bitcoin", normalizeTopicSearchQuery),
    ).toBe(true);
    expect(
      isDebouncedSearchPending("   ", "bitcoin", normalizeTopicSearchQuery),
    ).toBe(false);
    expect(
      isDebouncedSearchPending(
        "Hello",
        "hello",
        (value) => normalizeSearchRequestQuery(value, "posts"),
      ),
    ).toBe(true);
  });
});
