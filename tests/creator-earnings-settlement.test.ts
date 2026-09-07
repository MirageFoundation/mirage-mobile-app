// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  parseTxErrorDetails,
  settleCreatorClaim,
} from "../src/api/write/utils/creator-claim-model";
import { allSubmittedEpochsClaimed } from "../src/domain/creator-earnings";

const delivery = { tx_hash: "ABC", code: 0, height: 1, raw_log: "" };

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      }
      t += ms;
    },
  };
}

describe("creator claim settlement", () => {
  test("parses structured and string error_details", () => {
    expect(parseTxErrorDetails("claim window closed")).toBe("claim window closed");
    expect(parseTxErrorDetails({ message: "already claimed" })).toBe("already claimed");
    expect(parseTxErrorDetails(null)).toMatch(/rejected/);
  });

  test("stage A polls get_tx_status then stage B requires claimed_height on all epochs", async () => {
    const time = clock();
    let historyCalls = 0;
    const result = await settleCreatorClaim({
      epochIds: [4, 7],
      txHash: "ABC",
      delivery,
      now: time.now,
      sleep: time.sleep,
      confirmTimeoutMs: 60_000,
      syncTimeoutMs: 120_000,
      delays: [1],
      delayCapMs: 1,
      getTxStatus: async (hash) => {
        expect(hash).toBe("abc");
        return { found: true, success: true, code: 0 };
      },
      fetchHistory: async () => {
        historyCalls += 1;
        if (historyCalls === 1) {
          return {
            items: [
              { epoch_id: 4, claimed_height: 99, earned: "1", claimed: "1", epoch_start_unix: 1, epoch_end_unix: 2, claim_deadline_unix: 3, posts: [], posts_next_cursor: null, posts_has_more: false },
              { epoch_id: 7, claimed_height: null, earned: "1", claimed: "0", epoch_start_unix: 1, epoch_end_unix: 2, claim_deadline_unix: 3, posts: [], posts_next_cursor: null, posts_has_more: false },
            ],
            creator_epoch_seconds: 300,
            origin_epoch: 1,
            origin_unix: 1,
            max_creator_claim_epochs: 4,
            next_cursor: null,
            has_more: false,
          };
        }
        return {
          items: [
            { epoch_id: 4, claimed_height: 99, earned: "1", claimed: "1", epoch_start_unix: 1, epoch_end_unix: 2, claim_deadline_unix: 3, posts: [], posts_next_cursor: null, posts_has_more: false },
            { epoch_id: 7, claimed_height: 100, earned: "1", claimed: "1", epoch_start_unix: 1, epoch_end_unix: 2, claim_deadline_unix: 3, posts: [], posts_next_cursor: null, posts_has_more: false },
          ],
          creator_epoch_seconds: 300,
          origin_epoch: 1,
          origin_unix: 1,
          max_creator_claim_epochs: 4,
          next_cursor: null,
          has_more: false,
        };
      },
    });
    expect(result.phase).toBe("settled");
    expect(historyCalls).toBe(2);
    expect(allSubmittedEpochsClaimed(result.rows, [4, 7])).toBe(true);
  });

  test("partial claimed_height keeps the batch unsynced", () => {
    expect(allSubmittedEpochsClaimed([
      { epoch_id: 4, claimed_height: 9, earned: "1", claimed: "1", epoch_start_unix: 1, epoch_end_unix: 2, claim_deadline_unix: 3, posts: [], posts_next_cursor: null, posts_has_more: false },
    ], [4, 7])).toBe(false);
  });

  test("chain rejection after found does not poll history", async () => {
    let historyCalls = 0;
    await expect(settleCreatorClaim({
      epochIds: [4],
      txHash: "abc",
      delivery,
      getTxStatus: async () => ({
        found: true,
        success: false,
        code: 1,
        error_details: { message: "claim window closed" },
      }),
      fetchHistory: async () => {
        historyCalls += 1;
        return { items: [], creator_epoch_seconds: 300, origin_epoch: 1, origin_unix: 1, max_creator_claim_epochs: 4, next_cursor: null, has_more: false };
      },
    })).rejects.toThrow("claim window closed");
    expect(historyCalls).toBe(0);
  });

  test("stage A timeout is confirming pending and does not invent settlement", async () => {
    const time = clock();
    const result = await settleCreatorClaim({
      epochIds: [4],
      txHash: "abc",
      delivery,
      now: time.now,
      sleep: time.sleep,
      confirmTimeoutMs: 2,
      delays: [1],
      delayCapMs: 1,
      getTxStatus: async () => ({ found: false }),
      fetchHistory: async () => {
        throw new Error("should not fetch history");
      },
    });
    expect(result.phase).toBe("confirming_timeout");
    expect(result.txHash).toBe("abc");
    expect(result.epochIds).toEqual([4]);
  });

  test("stage B timeout retains tx and epochs as delivered_syncing_timeout", async () => {
    const time = clock();
    const result = await settleCreatorClaim({
      epochIds: [4],
      txHash: "abc",
      delivery,
      now: time.now,
      sleep: time.sleep,
      confirmTimeoutMs: 60_000,
      syncTimeoutMs: 2,
      delays: [1],
      delayCapMs: 1,
      getTxStatus: async () => ({ found: true, success: true, code: 0 }),
      fetchHistory: async () => ({
        items: [{ epoch_id: 4, claimed_height: null, earned: "1", claimed: "0", epoch_start_unix: 1, epoch_end_unix: 2, claim_deadline_unix: 3, posts: [], posts_next_cursor: null, posts_has_more: false }],
        creator_epoch_seconds: 300,
        origin_epoch: 1,
        origin_unix: 1,
        max_creator_claim_epochs: 4,
        next_cursor: null,
        has_more: false,
      }),
    });
    expect(result.phase).toBe("delivered_syncing_timeout");
    expect(result.txHash).toBe("abc");
  });

  test("abort during confirmation preserves tx for resume", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(settleCreatorClaim({
      epochIds: [4],
      txHash: "abc",
      delivery,
      signal: controller.signal,
      getTxStatus: async () => ({ found: false }),
      fetchHistory: async () => {
        throw new Error("should not fetch history");
      },
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});
