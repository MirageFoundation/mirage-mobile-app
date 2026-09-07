// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { queryKeys } from "../src/api/read/query-keys";
import {
  isDebouncedSearchPending,
  normalizeCommunitySearchQuery,
  normalizeSearchRequestQuery,
} from "../src/api/read/search-query";

describe("community search query normalization", () => {
  test("lowercases uppercase community input and trims whitespace", () => {
    expect(normalizeCommunitySearchQuery("  Bitcoin ")).toBe("bitcoin");
    expect(normalizeCommunitySearchQuery("BITCOIN")).toBe("bitcoin");
    expect(normalizeCommunitySearchQuery(null)).toBe("");
    expect(normalizeCommunitySearchQuery(undefined)).toBe("");
  });

  test("strips a leading # so dedicated community search stays hash-free", () => {
    expect(normalizeCommunitySearchQuery("#Bitcoin")).toBe("bitcoin");
    expect(normalizeCommunitySearchQuery("  #BITCOIN  ")).toBe("bitcoin");
    expect(normalizeCommunitySearchQuery("#")).toBe("");
    expect(normalizeCommunitySearchQuery("[Bitcoin]")).toBe("bitcoin");
    expect(normalizeCommunitySearchQuery("  [BITCOIN]  ")).toBe("bitcoin");
  });

  test("unified community search lowercases typed communities and #Community prefixes", () => {
    expect(normalizeSearchRequestQuery("  Bitcoin ", "communities")).toBe("bitcoin");
    expect(normalizeSearchRequestQuery("#Bitcoin", "communities")).toBe("#bitcoin");
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

describe("community search query-key consistency", () => {
  test("unified community keys match across mixed-case in-flight and follow-up queries", () => {
    const inFlight = queryKeys.search("Bitcoin", "communities", 20, "sensitive", undefined);
    const followUp = queryKeys.search("BITCOIN", "communities", 20, "sensitive", undefined);
    const hashed = queryKeys.search("#Bitcoin", undefined, 20, "sensitive", undefined);

    expect(inFlight).toEqual(followUp);
    expect(hashed).toEqual(
      queryKeys.search("#bitcoin", undefined, 20, "sensitive", undefined),
    );
    expect(inFlight).not.toEqual(hashed);
  });

  test("non-community searches keep distinct keys when only case differs", () => {
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

describe("community search debounce pending state", () => {
  test("does not stay pending when visible input only differs by case", () => {
    expect(
      isDebouncedSearchPending("Bitcoin", "bitcoin", normalizeCommunitySearchQuery),
    ).toBe(false);
    expect(
      isDebouncedSearchPending("  BITCOIN  ", "bitcoin", normalizeCommunitySearchQuery),
    ).toBe(false);
    expect(
      isDebouncedSearchPending("#Bitcoin", "bitcoin", normalizeCommunitySearchQuery),
    ).toBe(false);
    expect(
      isDebouncedSearchPending(
        "Bitcoin",
        "bitcoin",
        (value) => normalizeSearchRequestQuery(value, "communities"),
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

  test("stays pending for a different community and clears on empty input", () => {
    expect(
      isDebouncedSearchPending("Ethereum", "bitcoin", normalizeCommunitySearchQuery),
    ).toBe(true);
    expect(
      isDebouncedSearchPending("   ", "bitcoin", normalizeCommunitySearchQuery),
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
