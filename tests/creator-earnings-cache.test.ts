// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../src/api/read/query-keys";
import {
  creatorClaimInvalidationKeys,
  invalidateAfterCreatorClaimSettled,
} from "../src/api/cache/creator-earnings-cache";
import { applyCreatorClaimSettledEffects } from "../src/api/write/utils/creator-claim-settled-effects";

const CREATOR = "mirage1creator";

describe("creator earnings cache", () => {
  test("settled success invalidates earnings, targets, status, profile, and parameters only", async () => {
    const queryClient = new QueryClient();
    const earnings = queryKeys.creatorEarnings(CREATOR, { claimable_only: true, sort: "claim_deadline_asc" });
    const targets = queryKeys.creatorEarningsTargets(CREATOR, 4);
    const status = queryKeys.userStatus(CREATOR);
    const profile = queryKeys.profile(CREATOR);
    const account = queryKeys.accountStatus(CREATOR);
    const parameters = queryKeys.parameters(CREATOR);
    const posts = queryKeys.postsRoot();
    const communities = queryKeys.communitiesRoot();
    for (const key of [earnings, targets, status, profile, account, parameters, posts, communities]) {
      queryClient.setQueryData(key, { ok: true });
    }

    await invalidateAfterCreatorClaimSettled(queryClient, CREATOR);

    expect(queryClient.getQueryState(earnings)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(targets)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(status)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(profile)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(account)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(parameters)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(posts)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(communities)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(posts)).toEqual({ ok: true });
  });

  test("timeout does not apply settled invalidations", async () => {
    const queryClient = new QueryClient();
    const earnings = queryKeys.creatorEarningsRoot();
    queryClient.setQueryData(earnings, { ok: true });
    applyCreatorClaimSettledEffects(queryClient, {
      phase: "delivered_syncing_timeout",
      txHash: "abc",
      epochIds: [4],
      delivery: { tx_hash: "abc", code: 0, height: 0, raw_log: "" },
      confirmSettlement: { status: "settled" },
      historySettlement: { status: "timeout" },
      rows: [],
    }, CREATOR);
    expect(queryClient.getQueryState(earnings)?.isInvalidated).toBe(false);
  });

  test("invalidation key list is exact", () => {
    expect(creatorClaimInvalidationKeys(CREATOR)).toEqual([
      queryKeys.creatorEarningsRoot(),
      queryKeys.creatorEarningsTargetsRoot(),
      queryKeys.userStatus(CREATOR),
      queryKeys.profile(CREATOR),
      queryKeys.accountStatus(CREATOR),
      queryKeys.parameters(CREATOR),
    ]);
  });
});
