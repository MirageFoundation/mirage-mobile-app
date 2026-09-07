import { parseUserLevel } from "@/src/domain/subscriptions";

export const TIER_NAMES: Record<number, string> = {
  0: "Free",
  1: "Subscriber",
  100: "Admin",
};

export const getTierName = (level: number): string => {
  return parseUserLevel(level).name;
};

export const TIER_COLORS: Record<number, string> = {
  0: "#6B7280",
  1: "#F59E0B",
  100: "#EF4444",
};

export const getTierColor = (level: number): string => {
  const parsed = parseUserLevel(level);
  if (parsed.kind === "admin") return TIER_COLORS[100];
  if (parsed.kind === "subscriber") return TIER_COLORS[1];
  return TIER_COLORS[0];
};

export const TIER_USERNAME_COLORS: Record<number, string> = {
  1: "#F59E0B",
  100: "#EF4444",
};

export const getUsernameColor = (level: number): string | undefined => {
  const parsed = parseUserLevel(level);
  if (parsed.kind === "admin") return TIER_USERNAME_COLORS[100];
  if (parsed.kind === "subscriber") return TIER_USERNAME_COLORS[1];
  return undefined;
};

export const getTierIndex = (level: number): number => {
  return parseUserLevel(level).index ?? -1;
};

export const TIER_LEVEL_FROM_INDEX: Record<number, number> = {
  0: 0,
  1: 1,
  2: 100,
};

export type TierPostLimits = {
  maxTitleLength: number;
  maxContentLength: number;
};

const TIER_POST_LIMITS: Record<number, TierPostLimits> = {
  0: { maxTitleLength: 130, maxContentLength: 1000 },
  1: { maxTitleLength: 200, maxContentLength: 20000 },
};

const DEFAULT_POST_LIMITS: TierPostLimits = TIER_POST_LIMITS[0];

export const getTierPostLimits = (level: number): TierPostLimits => {
  const parsed = parseUserLevel(level);
  if (parsed.kind === "admin" || parsed.kind === "subscriber") {
    return TIER_POST_LIMITS[1];
  }
  return DEFAULT_POST_LIMITS;
};

const TIER_EDIT_TIME_LIMITS_MINUTES: Record<number, number> = {
  0: 10,
  1: 60,
  100: Infinity,
};

export const getEditTimeLimitMinutes = (level: number): number => {
  const parsed = parseUserLevel(level);
  if (parsed.kind === "admin") return TIER_EDIT_TIME_LIMITS_MINUTES[100];
  if (parsed.kind === "subscriber") return TIER_EDIT_TIME_LIMITS_MINUTES[1];
  return TIER_EDIT_TIME_LIMITS_MINUTES[0];
};

export const canEditContent = (
  level: number,
  createdAtSeconds: number,
): { allowed: boolean; remainingMinutes: number; limitMinutes: number } => {
  const limitMinutes = getEditTimeLimitMinutes(level);
  if (limitMinutes === Infinity) {
    return { allowed: true, remainingMinutes: Infinity, limitMinutes };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const elapsedMinutes = (nowSeconds - createdAtSeconds) / 60;
  const remainingMinutes = Math.max(0, Math.ceil(limitMinutes - elapsedMinutes));
  return {
    allowed: elapsedMinutes < limitMinutes,
    remainingMinutes,
    limitMinutes,
  };
};

export const getDisplayUsername = (username: string | null, level: number): string => {
  if (!username) return "Anon";
  if (level === 0 && !username.startsWith("Anon-")) {
    return `Anon-${username}`;
  }
  return username;
};
