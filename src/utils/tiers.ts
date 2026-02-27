export const TIER_NAMES: Record<number, string> = {
  0: "Free",
  1: "Basic",
  2: "Pro",
  3: "Premium",
  100: "God",
};

export const getTierName = (level: number): string => {
  return TIER_NAMES[level] ?? "Free";
};

export const TIER_USERNAME_COLORS: Record<number, string> = {
  1: "#EAB308",
  2: "#3B82F6",
  3: "#A855F7",
  100: "#EF4444",
};

export const getUsernameColor = (level: number): string | undefined => {
  return TIER_USERNAME_COLORS[level];
};

export type TierPostLimits = {
  maxTitleLength: number;
  maxContentLength: number;
};

const TIER_POST_LIMITS: Record<number, TierPostLimits> = {
  0: { maxTitleLength: 130, maxContentLength: 1000 },
  1: { maxTitleLength: 165, maxContentLength: 2000 },
  2: { maxTitleLength: 200, maxContentLength: 5000 },
  3: { maxTitleLength: 250, maxContentLength: 25000 },
};

const DEFAULT_POST_LIMITS: TierPostLimits = TIER_POST_LIMITS[0];

export const getTierPostLimits = (level: number): TierPostLimits => {
  return TIER_POST_LIMITS[level] ?? DEFAULT_POST_LIMITS;
};
