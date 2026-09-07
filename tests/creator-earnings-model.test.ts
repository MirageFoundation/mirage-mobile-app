// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  createEarningsPageGuard,
  currentCreatorEpoch,
  formatCreatorRewardTime,
  formatMirageAmount,
  isCreatorEarningClaimable,
  nextClaimSelection,
  normalizeClaimEpochs,
  normalizeCreatorEarningsRequest,
  parseCreatorEarningsResponse,
  remainingAmount,
  sumRemainingAmounts,
} from "../src/domain/creator-earnings";

const schedule = {
  creator_epoch_seconds: 300,
  origin_epoch: 10,
  origin_unix: 100,
  max_creator_claim_epochs: 4,
};

function page(items, extra = {}) {
  return parseCreatorEarningsResponse({
    ...schedule,
    items,
    next_cursor: extra.next_cursor ?? null,
    has_more: extra.has_more ?? false,
  });
}

describe("creator earnings request normalization", () => {
  test("rejects oldest/newest aliases and invalid combinations", () => {
    expect(() =>
      normalizeCreatorEarningsRequest({
        creator: "mirage1creator",
        claimable_only: true,
        sort: "oldest",
      }),
    ).toThrow("invalid_input");
    expect(() =>
      normalizeCreatorEarningsRequest({
        creator: "mirage1creator",
        claimable_only: false,
        sort: "newest",
      }),
    ).toThrow("invalid_input");
    expect(() =>
      normalizeCreatorEarningsRequest({
        creator: "mirage1creator",
        claimable_only: true,
        sort: "epoch_desc",
      }),
    ).toThrow("invalid_input");
    expect(() =>
      normalizeCreatorEarningsRequest({
        creator: "mirage1creator",
        claimable_only: false,
        sort: "claim_deadline_asc",
      }),
    ).toThrow("invalid_input");
  });

  test("defaults claimable to claim_deadline_asc and history to epoch_desc", () => {
    expect(
      normalizeCreatorEarningsRequest({ creator: "MIRAGE1CREATOR", claimable_only: true }).sort,
    ).toBe("claim_deadline_asc");
    expect(
      normalizeCreatorEarningsRequest({ creator: "mirage1creator", claimable_only: false }).sort,
    ).toBe("epoch_desc");
  });
});

describe("creator earnings amounts and claimability", () => {
  test("uses exact BigInt remaining amounts", () => {
    expect(remainingAmount({ earned: "1000001", claimed: "1" })).toBe(1000000n);
    expect(formatMirageAmount(remainingAmount({ earned: "1500000", claimed: "500000" }))).toBe(
      "1 MIRAGE",
    );
    expect(sumRemainingAmounts([
      { earned: "3", claimed: "1" },
      { earned: "5", claimed: "2" },
    ])).toBe(5n);
  });

  test("claimability is strict now < claim_deadline_unix", () => {
    const item = {
      earned: "100",
      claimed: "0",
      claimed_height: null,
      claim_deadline_unix: 1800,
    };
    expect(isCreatorEarningClaimable(item, 1_799_999)).toBe(true);
    expect(isCreatorEarningClaimable(item, 1_800_000)).toBe(false);
    expect(isCreatorEarningClaimable({ ...item, claimed_height: 9 }, 1_799_999)).toBe(false);
  });

  test("preserves decimal strings and nullables", () => {
    const parsed = parseCreatorEarningsResponse({
      ...schedule,
      items: [{
        epoch_id: 4,
        earned: "100",
        claimed: "0",
        epoch_start_unix: null,
        epoch_end_unix: null,
        claim_deadline_unix: null,
        claimed_height: null,
        posts: [{
          txhash: "aa",
          amount: "40",
          title: null,
          excerpt: null,
          community: null,
        }],
        posts_next_cursor: null,
        posts_has_more: false,
      }],
      has_more: false,
      next_cursor: null,
    });
    expect(parsed.items[0].earned).toBe("100");
    expect(parsed.items[0].claimed).toBe("0");
    expect(parsed.items[0].posts[0].amount).toBe("40");
    expect(parsed.items[0].claim_deadline_unix).toBeNull();
    expect(parsed.items[0].claimed_height).toBeNull();
    expect(parsed.items[0].posts[0].title).toBeNull();
    expect(parsed.items[0].posts[0].community).toBeNull();
  });
});

describe("creator earnings pagination guard", () => {
  test("rejects repeated cursors and schedule changes", () => {
    const guard = createEarningsPageGuard();
    guard.accept(page([], { has_more: true, next_cursor: "12" }));
    expect(() => guard.accept(page([], { has_more: true, next_cursor: "12" }))).toThrow(
      "cursor repeated",
    );
    const next = createEarningsPageGuard();
    next.accept(page([]));
    expect(() =>
      next.accept(parseCreatorEarningsResponse({
        ...schedule,
        max_creator_claim_epochs: 8,
        items: [],
        has_more: false,
        next_cursor: null,
      })),
    ).toThrow("changed during pagination");
  });
});

describe("creator claim selection", () => {
  test("normalizes epoch ids deduped ascending and respects dynamic cap", () => {
    expect(normalizeClaimEpochs([9, 3, 9, 5], 10)).toEqual([3, 5, 9]);
    expect(() => normalizeClaimEpochs([], 4)).toThrow("at least one");
    expect(() => normalizeClaimEpochs([1, 2, 3], 2)).toThrow("at most 2");
    expect(nextClaimSelection([1, 2], 3, 2)).toEqual({ selected: [1, 2], atCap: true });
    expect(nextClaimSelection([1, 2], 2, 2)).toEqual({ selected: [1], atCap: false });
  });
});

describe("creator reward time", () => {
  test("shows UTC time for sub-daily intervals", () => {
    const unix = Date.UTC(2026, 7, 27, 12, 5, 0) / 1000;
    expect(formatCreatorRewardTime(unix, 300)).toMatch(/12:05.*UTC/);
    expect(formatCreatorRewardTime(unix, 86400)).not.toMatch(/12:05/);
  });

  test("uses configured creator reward interval", () => {
    const now = Date.UTC(2026, 7, 27, 23, 59, 59);
    expect(currentCreatorEpoch(86400, now)).toBe(20692);
  });
});
