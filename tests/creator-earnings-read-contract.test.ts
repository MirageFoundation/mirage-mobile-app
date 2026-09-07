// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const getCalls: { path: string; params?: Record<string, unknown> }[] = [];

mock.module("../src/api/client", () => ({
  api: {
    get: async (path: string, params?: Record<string, unknown>) => {
      getCalls.push({ path, params });
      if (path === "/creator/earnings") {
        const row = (epoch: number) => ({
          epoch_id: epoch,
          earned: "100",
          claimed: "0",
          epoch_start_unix: 1,
          epoch_end_unix: 2,
          claim_deadline_unix: 3,
          claimed_height: null,
          posts: [],
          posts_next_cursor: null,
          posts_has_more: false,
        });
        if (!params?.cursor) {
          return {
            items: [row(1)],
            creator_epoch_seconds: 300,
            origin_epoch: 10,
            origin_unix: 100,
            max_creator_claim_epochs: 4,
            next_cursor: "next",
            has_more: true,
          };
        }
        return {
          items: [row(2)],
          creator_epoch_seconds: 300,
          origin_epoch: 10,
          origin_unix: 100,
          max_creator_claim_epochs: 4,
          next_cursor: null,
          has_more: false,
        };
      }
      if (path.includes("/targets")) {
        return { items: [], next_cursor: null, has_more: false };
      }
      throw new Error(`unexpected path ${path}`);
    },
  },
  apiClient: {},
}));

const { fetchCreatorEarningsPages, getCreatorEarnings, getCreatorEarningTargets } = await import(
  "../src/api/read/endpoints/creator-earnings"
);

describe("creator earnings read contract", () => {
  test("public earnings request sends exact fields and no proofs", async () => {
    getCalls.length = 0;
    await getCreatorEarnings({
      creator: " MIRAGE1CREATOR ",
      claimable_only: true,
      sort: "claim_deadline_asc",
      limit: 25,
    });
    expect(getCalls).toEqual([
      {
        path: "/creator/earnings",
        params: {
          creator: "mirage1creator",
          limit: 25,
          claimable_only: "true",
          sort: "claim_deadline_asc",
        },
      },
    ]);
    const params = getCalls[0]?.params ?? {};
    expect(params).not.toHaveProperty("pubkey");
    expect(params).not.toHaveProperty("signature");
    expect(params).not.toHaveProperty("timestamp");
    expect(params).not.toHaveProperty("envelope_nonce");
    expect(params).not.toHaveProperty("address");
    expect(params).not.toHaveProperty("viewer");
  });

  test("history defaults to epoch_desc and claimable_only false string", async () => {
    getCalls.length = 0;
    await getCreatorEarnings({ creator: "mirage1creator", claimable_only: false });
    expect(getCalls[0]?.params).toEqual({
      creator: "mirage1creator",
      limit: 25,
      claimable_only: "false",
      sort: "epoch_desc",
    });
  });

  test("targets are public unsigned with amount:txhash cursor lowercased", async () => {
    getCalls.length = 0;
    await getCreatorEarningTargets({
      creator: "MIRAGE1CREATOR",
      epoch_id: 12,
      limit: 25,
      cursor: "100:AABB",
    });
    expect(getCalls).toEqual([
      {
        path: "/creator/earnings/12/targets",
        params: {
          creator: "mirage1creator",
          limit: 25,
          cursor: "100:aabb",
        },
      },
    ]);
    expect(getCalls[0]?.params).not.toHaveProperty("pubkey");
  });

  test("pages claimable earnings with claim_deadline_asc and cursor", async () => {
    getCalls.length = 0;
    const result = await fetchCreatorEarningsPages({
      creator: "mirage1creator",
      claimable_only: true,
      sort: "claim_deadline_asc",
    });
    expect(result.items.map((item) => item.epoch_id)).toEqual([1, 2]);
    expect(getCalls[0]?.params).toMatchObject({
      claimable_only: "true",
      sort: "claim_deadline_asc",
    });
    expect(getCalls[1]?.params?.cursor).toBe("next");
  });

  test("missing epoch returns empty success without HTTP", async () => {
    getCalls.length = 0;
    const result = await getCreatorEarningTargets({
      creator: "mirage1creator",
      epoch_id: undefined,
    });
    expect(result).toEqual({ items: [], next_cursor: null, has_more: false });
    expect(getCalls).toEqual([]);
  });
});
