// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  chunkModerationPostIds,
  groupEligibleModerationPosts,
  MODERATION_BATCH_CAP,
  normalizeHexPostId,
} from "../src/domain/communities";

function hexId(n: number): string {
  return n.toString(16).padStart(64, "0");
}

describe("batch moderation grouping", () => {
  test("accepts 50 ids in one chunk and splits 51 into 50+1", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => hexId(i + 1));
    expect(chunkModerationPostIds(fifty)).toEqual([fifty.slice().sort()]);
    const fiftyOne = [...fifty, hexId(51)];
    const chunks = chunkModerationPostIds(fiftyOne);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[1]).toHaveLength(1);
    expect(MODERATION_BATCH_CAP).toBe(50);
  });

  test("dedupes, lowercases, sorts, and drops invalid ids", () => {
    const a = hexId(10);
    const b = hexId(2);
    expect(chunkModerationPostIds([a.toUpperCase(), a, "not-an-id", b])[0]).toEqual(
      [a, b].sort(),
    );
    expect(normalizeHexPostId("ZZ")).toBeNull();
    expect(normalizeHexPostId(a.toUpperCase())).toBe(a);
  });

  test("groups only by community + served effective team the viewer curates", () => {
    const memberships = [
      { community: "bitcoin", team_id: 3, name: "Core" },
      { community: "ethereum", team_id: 1, name: "Eth" },
    ];
    const groups = groupEligibleModerationPosts({
      memberships,
      posts: [
        { post_id: hexId(1), community: "bitcoin", lens: { requested: "team", effective_mode: 1, effective_team_id: 3 } },
        { id: hexId(1), community: "bitcoin", lens: { requested: "team", effective_mode: 1, effective_team_id: 3 } },
        { post_id: hexId(2), community: "bitcoin", lens: { requested: "team", effective_mode: 1, effective_team_id: 9 } },
        { post_id: hexId(3), community: "ethereum", lens: { requested: "default", effective_mode: 0, effective_team_id: 1 } },
        { post_id: "bad", community: "bitcoin", lens: { requested: "team", effective_mode: 1, effective_team_id: 3 } },
      ],
    });
    expect(groups).toEqual([
      { community: "bitcoin", team_id: 3, post_ids: [hexId(1)] },
      { community: "ethereum", team_id: 1, post_ids: [hexId(3)] },
    ]);
  });
});
