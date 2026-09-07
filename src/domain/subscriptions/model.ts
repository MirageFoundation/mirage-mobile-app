import type { DailyQuota, RenewalWarning } from "@/src/domain/communities";

export const MIN_SUBSCRIPTION_PERIOD_COUNT = 1;
export const MAX_SUBSCRIPTION_PERIOD_COUNT = 12;
export const PURCHASABLE_SUBSCRIPTION_LEVEL = 1;
export const RENEWAL_NOTICE_WINDOW_DAYS = 7;
export const UMIRAGE_PER_MIRAGE = 1_000_000;

export type TierKind = "free" | "subscriber" | "admin" | "unknown";

export type ParsedUserLevel = {
  level: number;
  kind: TierKind;
  index: number | null;
  name: string;
  valid: boolean;
};

export type RelayDecision = {
  pow_required: boolean;
  relay_allowed: boolean;
  quota_exhausted: boolean;
};

export type ModernTierConfig = {
  period_fee: number;
  vote_weight: number;
  max_title_length: number;
  max_content_length: number;
  max_followed_users: number;
  max_joined_communities: number;
  max_blocked_users: number;
  max_blocked_posts: number;
  max_blocked_communities: number;
  editing_time_mins: number;
  can_have_biography: boolean;
  can_have_avatar: boolean;
  can_have_banner: boolean;
  can_have_flair: boolean;
  max_biography_length: number;
  max_curation_memberships: number;
  max_daily_relays: number;
};

export type ModernTiers = [ModernTierConfig, ModernTierConfig, ModernTierConfig];

const TIER_NAMES: Record<TierKind, string> = {
  free: "Free",
  subscriber: "Subscriber",
  admin: "Admin",
  unknown: "Unknown",
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseUserLevel(level: unknown): ParsedUserLevel {
  if (!isFiniteNumber(level)) {
    return { level: Number.NaN, kind: "unknown", index: null, name: TIER_NAMES.unknown, valid: false };
  }
  if (level === 0) {
    return { level, kind: "free", index: 0, name: TIER_NAMES.free, valid: true };
  }
  if (level === 1) {
    return { level, kind: "subscriber", index: 1, name: TIER_NAMES.subscriber, valid: true };
  }
  if (level >= 100) {
    return { level, kind: "admin", index: 2, name: TIER_NAMES.admin, valid: true };
  }
  return { level, kind: "unknown", index: null, name: TIER_NAMES.unknown, valid: false };
}

export function isRelayEntitled(input: {
  userLevel?: number | null;
  effectivePaid?: boolean | null;
}): boolean {
  if (input.effectivePaid === true) return true;
  return parseUserLevel(input.userLevel).kind === "admin";
}

export function parseModernTier(value: unknown): ModernTierConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const periodFee = toFiniteNumber(raw.period_fee);
  const voteWeight = toFiniteNumber(raw.vote_weight);
  const maxTitleLength = toFiniteNumber(raw.max_title_length);
  const maxContentLength = toFiniteNumber(raw.max_content_length);
  const maxFollowedUsers = toFiniteNumber(raw.max_followed_users);
  const maxJoinedCommunities = toFiniteNumber(raw.max_joined_communities);
  const maxBlockedUsers = toFiniteNumber(raw.max_blocked_users);
  const maxBlockedPosts = toFiniteNumber(raw.max_blocked_posts);
  const maxBlockedCommunities = toFiniteNumber(raw.max_blocked_communities);
  const editingTimeMins = toFiniteNumber(raw.editing_time_mins);
  const maxBiographyLength = toFiniteNumber(raw.max_biography_length);
  const maxCurationMemberships = toFiniteNumber(raw.max_curation_memberships);
  const maxDailyRelays = toFiniteNumber(raw.max_daily_relays);
  if (
    periodFee === null ||
    voteWeight === null ||
    maxTitleLength === null ||
    maxContentLength === null ||
    maxFollowedUsers === null ||
    maxJoinedCommunities === null ||
    maxBlockedUsers === null ||
    maxBlockedPosts === null ||
    maxBlockedCommunities === null ||
    editingTimeMins === null ||
    maxBiographyLength === null ||
    maxCurationMemberships === null ||
    maxDailyRelays === null
  ) {
    return null;
  }
  return {
    period_fee: periodFee,
    vote_weight: voteWeight,
    max_title_length: maxTitleLength,
    max_content_length: maxContentLength,
    max_followed_users: maxFollowedUsers,
    max_joined_communities: maxJoinedCommunities,
    max_blocked_users: maxBlockedUsers,
    max_blocked_posts: maxBlockedPosts,
    max_blocked_communities: maxBlockedCommunities,
    editing_time_mins: editingTimeMins,
    can_have_biography: toBoolean(raw.can_have_biography),
    can_have_avatar: toBoolean(raw.can_have_avatar),
    can_have_banner: toBoolean(raw.can_have_banner),
    can_have_flair: toBoolean(raw.can_have_flair),
    max_biography_length: maxBiographyLength,
    max_curation_memberships: maxCurationMemberships,
    max_daily_relays: maxDailyRelays,
  };
}

export function parseModernTiers(tiers: unknown): ModernTiers | null {
  if (!Array.isArray(tiers) || tiers.length !== 3) return null;
  const parsed = tiers.map(parseModernTier);
  if (parsed.some((tier) => tier === null)) return null;
  return parsed as ModernTiers;
}

export function assertPeriodCount(periodCount: unknown): number {
  if (
    !isFiniteNumber(periodCount) ||
    !Number.isInteger(periodCount) ||
    periodCount < MIN_SUBSCRIPTION_PERIOD_COUNT ||
    periodCount > MAX_SUBSCRIPTION_PERIOD_COUNT
  ) {
    throw new Error("period_count must be in [1,12]");
  }
  return periodCount;
}

export function clampPeriodCount(periodCount: number): number {
  if (!Number.isInteger(periodCount)) return MIN_SUBSCRIPTION_PERIOD_COUNT;
  return Math.min(
    MAX_SUBSCRIPTION_PERIOD_COUNT,
    Math.max(MIN_SUBSCRIPTION_PERIOD_COUNT, periodCount),
  );
}

export function subscriptionDurationSeconds(
  subscriptionPeriodMinutes: number,
  periodCount: number,
): number {
  const validated = assertPeriodCount(periodCount);
  const minutes = toFiniteNumber(subscriptionPeriodMinutes);
  if (minutes === null || minutes <= 0) return 0;
  return minutes * 60 * validated;
}

export function projectSubscriptionExpiry(input: {
  nowSeconds: number;
  currentExpiry?: number | null;
  durationSeconds: number;
}): number {
  const now = Math.max(0, Math.floor(input.nowSeconds));
  const current = toFiniteNumber(input.currentExpiry) ?? 0;
  const duration = Math.max(0, Math.floor(input.durationSeconds));
  return Math.max(now, current) + duration;
}

export function totalSubscriptionCost(periodFee: number, periodCount: number): number {
  const validated = assertPeriodCount(periodCount);
  const fee = toFiniteNumber(periodFee) ?? 0;
  return fee * validated;
}

export function hasInsufficientSubscriptionBalance(input: {
  balance: number | null | undefined;
  periodFee: number;
  periodCount: number;
}): boolean {
  if (!isFiniteNumber(input.balance)) return false;
  const total = totalSubscriptionCost(input.periodFee, input.periodCount);
  return total > 0 && input.balance < total;
}

export function parseDailyQuota(value: unknown): DailyQuota | null {
  if (value == null) return null;
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const epoch = raw.epoch;
  const used = raw.used;
  const limit = raw.limit;
  const remaining = raw.remaining;
  const resetAt = raw.reset_at;
  if (
    !isInteger(epoch) ||
    !isInteger(used) ||
    !isInteger(limit) ||
    !isInteger(remaining) ||
    !isInteger(resetAt)
  ) {
    return null;
  }
  return {
    epoch,
    used,
    limit,
    remaining,
    reset_at: resetAt,
  };
}

export function parseRenewalWarning(value: unknown): RenewalWarning | null {
  if (value == null) return null;
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const expiry = raw.expiry;
  const nextAttempt = raw.next_attempt;
  const lastAttemptEpoch = raw.last_attempt_epoch;
  if (
    !isInteger(expiry) ||
    !isInteger(nextAttempt) ||
    !isInteger(lastAttemptEpoch) ||
    typeof raw.warning_sent !== "boolean"
  ) {
    return null;
  }
  if (expiry <= 0) return null;
  return {
    expiry,
    next_attempt: nextAttempt,
    last_attempt_epoch: lastAttemptEpoch,
    warning_sent: raw.warning_sent,
  };
}

export function shouldShowRenewalNotice(input: {
  effectivePaid?: boolean | null;
  userLevel?: number | null;
  warning: RenewalWarning | null;
  nowSeconds?: number;
}): boolean {
  if (input.effectivePaid !== true) return false;
  if (parseUserLevel(input.userLevel).kind === "admin") return false;
  if (!input.warning || input.warning.expiry <= 0) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const days = Math.max(0, Math.ceil((input.warning.expiry - now) / 86400));
  return days <= RENEWAL_NOTICE_WINDOW_DAYS;
}

export function decideRelay(input: {
  userLevel?: number | null;
  effectivePaid?: boolean | null;
  quota?: DailyQuota | null;
  nowSeconds?: number;
}): RelayDecision {
  const entitled = isRelayEntitled({
    userLevel: input.userLevel,
    effectivePaid: input.effectivePaid,
  });
  if (!entitled) {
    return { pow_required: true, relay_allowed: false, quota_exhausted: false };
  }

  const quota = parseDailyQuota(input.quota);
  if (!quota) {
    return { pow_required: false, relay_allowed: true, quota_exhausted: false };
  }
  if (quota.remaining > 0) {
    return { pow_required: false, relay_allowed: true, quota_exhausted: false };
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (quota.remaining === 0 && quota.reset_at > now) {
    return { pow_required: false, relay_allowed: false, quota_exhausted: true };
  }
  return { pow_required: false, relay_allowed: true, quota_exhausted: false };
}

export function formatQuotaReset(resetAt: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const remaining = resetAt - nowSeconds;
  if (remaining <= 0) return "soon";
  const hours = Math.ceil(remaining / 3600);
  if (hours < 24) return `${hours}h`;
  const days = Math.ceil(remaining / 86400);
  return `${days}d`;
}
