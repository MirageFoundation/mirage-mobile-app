// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  INDEXER_SETTLEMENT_DELAY_CAP_MS,
  INDEXER_SETTLEMENT_DELAYS_MS,
  waitForIndexedCondition,
} from "../src/api/write/utils/indexer-settlement";
import {
  collectJoinedCommunityPages,
  matchesBlockSettlement,
  matchesJoinSettlement,
  matchesLeaveSettlement,
  matchesPreferenceSettlement,
} from "../src/api/write/utils/community-membership-model";

function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw new Error("Aborted");
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
    get time() {
      return t;
    },
  };
}

describe("waitForIndexedCondition", () => {
  test("reads immediately and settles without sleeping", async () => {
    const time = clock();
    const reads: number[] = [];
    const result = await waitForIndexedCondition({
      now: time.now,
      sleep: time.sleep,
      read: async () => {
        reads.push(time.time);
        return "ok";
      },
      matches: (value) => value === "ok",
    });
    expect(result).toEqual({ status: "settled", value: "ok" });
    expect(reads).toEqual([0]);
    expect(time.sleeps).toEqual([]);
  });

  test("uses 750/1000/1500/2250 then capped 3000 delays for delayed settlement", async () => {
    const time = clock();
    let reads = 0;
    const result = await waitForIndexedCondition({
      now: time.now,
      sleep: time.sleep,
      read: async () => {
        reads += 1;
        return reads >= 6 ? "ok" : "pending";
      },
      matches: (value) => value === "ok",
    });
    expect(result.status).toBe("settled");
    expect(time.sleeps.slice(0, 5)).toEqual([
      ...INDEXER_SETTLEMENT_DELAYS_MS,
      INDEXER_SETTLEMENT_DELAY_CAP_MS,
    ]);
  });

  test("retries transient read failures then settles", async () => {
    const time = clock();
    let reads = 0;
    const result = await waitForIndexedCondition({
      now: time.now,
      sleep: time.sleep,
      read: async () => {
        reads += 1;
        if (reads < 3) throw new Error("network");
        return "ok";
      },
      matches: (value) => value === "ok",
    });
    expect(result).toEqual({ status: "settled", value: "ok" });
    expect(reads).toBe(3);
  });

  test("timeout preserves last value and does not throw", async () => {
    const time = clock();
    const result = await waitForIndexedCondition({
      now: time.now,
      sleep: time.sleep,
      overallTimeoutMs: 1_000,
      delays: [750],
      delayCapMs: 750,
      read: async () => "pending",
      matches: () => false,
    });
    expect(result.status).toBe("timeout");
    expect(result.value).toBe("pending");
  });

  test("final confirming read that matches after the deadline still settles", async () => {
    const time = clock();
    let reads = 0;
    const result = await waitForIndexedCondition({
      now: time.now,
      sleep: time.sleep,
      overallTimeoutMs: 100,
      delays: [50],
      read: async () => {
        reads += 1;
        if (reads === 1) return "pending";
        time.advance(5_000);
        return "ok";
      },
      matches: (value) => value === "ok",
    });
    expect(result.status).toBe("settled");
    expect(result.value).toBe("ok");
  });

  test("caller abort stops polling", async () => {
    const controller = new AbortController();
    const time = clock();
    const pending = waitForIndexedCondition({
      signal: controller.signal,
      now: time.now,
      sleep: async (ms, signal) => {
        controller.abort();
        await time.sleep(ms, signal);
      },
      read: async () => "pending",
      matches: () => false,
    });
    await expect(pending).rejects.toThrow();
  });
});

describe("community settlement matchers", () => {
  test("default join accepts resolved team or raw and never stored_mode 0", () => {
    const fields = { community: "bitcoin", mode: 0, pinned_team_id: 0 };
    expect(matchesJoinSettlement({
      present: true,
      exhausted: true,
      detail: { viewer_joined: true, stored_mode: 0, stored_team_id: null },
    }, fields)).toBe(false);
    expect(matchesJoinSettlement({
      present: true,
      exhausted: true,
      detail: { viewer_joined: true, stored_mode: 1, stored_team_id: "4" },
    }, fields)).toBe(true);
    expect(matchesJoinSettlement({
      present: true,
      exhausted: true,
      detail: { viewer_joined: true, stored_mode: 2, stored_team_id: null },
    }, fields)).toBe(true);
    expect(matchesJoinSettlement({
      present: false,
      exhausted: true,
      detail: null,
    }, fields)).toBe(false);
  });

  test("leave pages every cursor until authoritative absence", async () => {
    const pages = [
      { items: [{ community: "ethereum" }], next_cursor: "1:ethereum", has_more: true },
      { items: [{ community: "solana" }], next_cursor: null, has_more: false },
    ];
    const collected = await collectJoinedCommunityPages(async () => pages.shift());
    expect(collected.exhausted).toBe(true);
    expect(collected.items.map((item) => item.community)).toEqual(["ethereum", "solana"]);
    expect(matchesLeaveSettlement(collected, "bitcoin")).toBe(true);
    expect(matchesLeaveSettlement({
      items: [{ community: "bitcoin" }],
      exhausted: true,
    }, "bitcoin")).toBe(false);
    expect(matchesLeaveSettlement({
      items: [],
      exhausted: false,
    }, "bitcoin")).toBe(false);
  });

  test("preference requires viewer_joined and exact stored mode/team", () => {
    expect(matchesPreferenceSettlement({
      viewer_joined: true,
      stored_mode: 1,
      stored_team_id: "4",
    }, { community: "bitcoin", mode: 1, pinned_team_id: 4 })).toBe(true);
    expect(matchesPreferenceSettlement({
      viewer_joined: true,
      stored_mode: 1,
      stored_team_id: "9",
    }, { community: "bitcoin", mode: 1, pinned_team_id: 4 })).toBe(false);
    expect(matchesPreferenceSettlement({
      viewer_joined: false,
      stored_mode: 2,
      stored_team_id: null,
    }, { community: "bitcoin", mode: 2, pinned_team_id: 0 })).toBe(false);
  });

  test("block/unblock match exact slug and blocking does not imply leave", () => {
    const blocked = { blocked_communities: ["bitcoin"], blocked_users: [], blocked_posts: [] };
    expect(matchesBlockSettlement(blocked, "Bitcoin", true)).toBe(true);
    expect(matchesBlockSettlement(blocked, "ethereum", true)).toBe(false);
    expect(matchesBlockSettlement(blocked, "bitcoin", false)).toBe(false);
    expect(matchesBlockSettlement({
      blocked_communities: [],
      blocked_users: [],
      blocked_posts: [],
    }, "bitcoin", false)).toBe(true);
  });
});
