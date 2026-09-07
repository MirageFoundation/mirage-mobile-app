// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  assertPeriodCount,
  decideRelay,
  hasInsufficientSubscriptionBalance,
  isRelayEntitled,
  parseDailyQuota,
  parseModernTiers,
  parseRenewalWarning,
  parseUserLevel,
  projectSubscriptionExpiry,
  shouldShowRenewalNotice,
  subscriptionDurationSeconds,
  totalSubscriptionCost,
} from "../src/domain/subscriptions";

const modernTier = (overrides = {}) => ({
  period_fee: 0,
  vote_weight: 1,
  max_title_length: 150,
  max_content_length: 1000,
  max_followed_users: 25,
  max_joined_communities: 25,
  max_blocked_users: 25,
  max_blocked_posts: 25,
  max_blocked_communities: 25,
  editing_time_mins: 10,
  can_have_biography: false,
  can_have_avatar: false,
  can_have_banner: false,
  can_have_flair: false,
  max_biography_length: 0,
  max_curation_memberships: 0,
  max_daily_relays: 0,
  ...overrides,
});

describe("parseUserLevel", () => {
  test("maps 0/1/>=100 and rejects stale or invalid levels", () => {
    expect(parseUserLevel(0)).toMatchObject({ kind: "free", index: 0, valid: true });
    expect(parseUserLevel(1)).toMatchObject({ kind: "subscriber", index: 1, valid: true });
    expect(parseUserLevel(100)).toMatchObject({ kind: "admin", index: 2, valid: true });
    expect(parseUserLevel(250)).toMatchObject({ kind: "admin", index: 2, valid: true });
    expect(parseUserLevel(10)).toMatchObject({ kind: "unknown", index: null, valid: false });
    expect(parseUserLevel(2)).toMatchObject({ kind: "unknown", valid: false });
    expect(parseUserLevel(-1)).toMatchObject({ kind: "unknown", valid: false });
    expect(parseUserLevel(Number.NaN)).toMatchObject({ kind: "unknown", valid: false });
  });
});

describe("modern tiers", () => {
  test("parses exactly three modern configs and rejects other lengths", () => {
    const tiers = parseModernTiers([
      modernTier(),
      modernTier({ period_fee: "100000000000", max_daily_relays: "200" }),
      modernTier({ period_fee: 0, max_daily_relays: 10000 }),
    ]);
    expect(tiers).not.toBeNull();
    expect(tiers[1].period_fee).toBe(100000000000);
    expect(tiers[1].max_daily_relays).toBe(200);
    expect(parseModernTiers([modernTier(), modernTier()])).toBeNull();
    expect(parseModernTiers([modernTier(), modernTier(), modernTier(), modernTier()])).toBeNull();
  });
});

describe("subscription periods", () => {
  test("validates 1-12, costs fee*periods, and extends expiry from max(now, current)", () => {
    expect(assertPeriodCount(1)).toBe(1);
    expect(assertPeriodCount(12)).toBe(12);
    expect(() => assertPeriodCount(0)).toThrow("period_count must be in [1,12]");
    expect(() => assertPeriodCount(13)).toThrow();
    expect(() => assertPeriodCount(1.5)).toThrow();
    expect(totalSubscriptionCost(100, 3)).toBe(300);
    expect(subscriptionDurationSeconds(43200, 2)).toBe(43200 * 60 * 2);
    expect(projectSubscriptionExpiry({
      nowSeconds: 1_000,
      currentExpiry: 900,
      durationSeconds: 100,
    })).toBe(1_100);
    expect(projectSubscriptionExpiry({
      nowSeconds: 1_000,
      currentExpiry: 1_500,
      durationSeconds: 100,
    })).toBe(1_600);
    expect(hasInsufficientSubscriptionBalance({
      balance: 199,
      periodFee: 100,
      periodCount: 2,
    })).toBe(true);
    expect(hasInsufficientSubscriptionBalance({
      balance: 200,
      periodFee: 100,
      periodCount: 2,
    })).toBe(false);
  });
});

describe("relay entitlement", () => {
  test("uses effective_paid or admin, not stale level 10 alone", () => {
    expect(isRelayEntitled({ userLevel: 0, effectivePaid: false })).toBe(false);
    expect(isRelayEntitled({ userLevel: 1, effectivePaid: true })).toBe(true);
    expect(isRelayEntitled({ userLevel: 100, effectivePaid: false })).toBe(true);
    expect(isRelayEntitled({ userLevel: 10, effectivePaid: false })).toBe(false);
    expect(isRelayEntitled({ userLevel: 10, effectivePaid: true })).toBe(true);
  });
});

describe("quota and renewal validation", () => {
  test("parses quota/renewal only from complete integer fields", () => {
    expect(parseDailyQuota({
      epoch: 1,
      used: 3,
      limit: 10,
      remaining: 7,
      reset_at: 86_400,
    })).toEqual({
      epoch: 1,
      used: 3,
      limit: 10,
      remaining: 7,
      reset_at: 86_400,
    });
    expect(parseDailyQuota({ epoch: 1, used: 3, limit: 10, remaining: 7 })).toBeNull();
    expect(parseRenewalWarning({
      expiry: 1_000,
      next_attempt: 900,
      last_attempt_epoch: 1,
      warning_sent: true,
    })?.expiry).toBe(1_000);
    expect(parseRenewalWarning({
      expiry: 0,
      next_attempt: 0,
      last_attempt_epoch: 0,
      warning_sent: false,
    })).toBeNull();
  });

  test("renewal notices are paid-only, positive, within 7 days, and not Admin", () => {
    const warning = {
      expiry: 1_000 + 3 * 86400,
      next_attempt: 1,
      last_attempt_epoch: 1,
      warning_sent: true,
    };
    expect(shouldShowRenewalNotice({
      effectivePaid: true,
      userLevel: 1,
      warning,
      nowSeconds: 1_000,
    })).toBe(true);
    expect(shouldShowRenewalNotice({
      effectivePaid: false,
      userLevel: 1,
      warning,
      nowSeconds: 1_000,
    })).toBe(false);
    expect(shouldShowRenewalNotice({
      effectivePaid: true,
      userLevel: 100,
      warning,
      nowSeconds: 1_000,
    })).toBe(false);
    expect(shouldShowRenewalNotice({
      effectivePaid: true,
      userLevel: 1,
      warning: { ...warning, expiry: 1_000 + 8 * 86400 },
      nowSeconds: 1_000,
    })).toBe(false);
  });
});

describe("decideRelay", () => {
  test("routes unpaid to PoW and respects quota without PoW fallback", () => {
    expect(decideRelay({ userLevel: 0, effectivePaid: false })).toEqual({
      pow_required: true,
      relay_allowed: false,
      quota_exhausted: false,
    });
    expect(decideRelay({
      userLevel: 1,
      effectivePaid: true,
      quota: { epoch: 1, used: 1, limit: 10, remaining: 9, reset_at: 99_999 },
      nowSeconds: 10,
    })).toEqual({
      pow_required: false,
      relay_allowed: true,
      quota_exhausted: false,
    });
    expect(decideRelay({
      userLevel: 1,
      effectivePaid: true,
      quota: { epoch: 1, used: 10, limit: 10, remaining: 0, reset_at: 99_999 },
      nowSeconds: 10,
    })).toEqual({
      pow_required: false,
      relay_allowed: false,
      quota_exhausted: true,
    });
    expect(decideRelay({
      userLevel: 1,
      effectivePaid: true,
      quota: { epoch: 1, used: 10, limit: 10, remaining: 0, reset_at: 5 },
      nowSeconds: 10,
    })).toEqual({
      pow_required: false,
      relay_allowed: true,
      quota_exhausted: false,
    });
    expect(decideRelay({ userLevel: 1, effectivePaid: true, quota: null })).toEqual({
      pow_required: false,
      relay_allowed: true,
      quota_exhausted: false,
    });
    expect(decideRelay({ userLevel: 10, effectivePaid: false })).toEqual({
      pow_required: true,
      relay_allowed: false,
      quota_exhausted: false,
    });
    expect(decideRelay({ userLevel: 10, effectivePaid: true })).toEqual({
      pow_required: false,
      relay_allowed: true,
      quota_exhausted: false,
    });
  });
});
