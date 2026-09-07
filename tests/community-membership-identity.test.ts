// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildJoinedCommunitySet,
  isCommunityJoined,
  normalizeCommunitySlug,
  toggleJoinedCommunities,
} from "../src/domain/communities";

describe("community membership identity", () => {
  test("normalizes case and surrounding whitespace", () => {
    expect(normalizeCommunitySlug("  Bitcoin ")).toBe("bitcoin");
    expect(normalizeCommunitySlug(null)).toBe("");
    expect(normalizeCommunitySlug(undefined)).toBe("");
  });

  test("matches a display-cased community against the lowercase server list", () => {
    const joined = buildJoinedCommunitySet(["bitcoin", "art"]);

    expect(isCommunityJoined(joined, "Bitcoin")).toBe(true);
    expect(isCommunityJoined(joined, "BITCOIN")).toBe(true);
    expect(isCommunityJoined(joined, "ethereum")).toBe(false);
  });

  test("works on a non-normalized screen-owned Set", () => {
    expect(isCommunityJoined(new Set(["Bitcoin"]), "bitcoin")).toBe(true);
  });

  test("works on the raw array form too", () => {
    expect(isCommunityJoined(["bitcoin"], "Bitcoin")).toBe(true);
    expect(isCommunityJoined([], "Bitcoin")).toBe(false);
    expect(isCommunityJoined(undefined, "Bitcoin")).toBe(false);
  });

  test("optimistic join stores the slug the server will return", () => {
    expect(toggleJoinedCommunities(["art"], "Bitcoin", true)).toEqual([
      "art",
      "bitcoin",
    ]);
  });

  test("optimistic join never duplicates an existing entry", () => {
    expect(toggleJoinedCommunities(["bitcoin"], "Bitcoin", true)).toEqual([
      "bitcoin",
    ]);
  });

  test("optimistic leave removes regardless of stored casing", () => {
    expect(toggleJoinedCommunities(["Bitcoin", "art"], "bitcoin", false)).toEqual([
      "art",
    ]);
  });
});
