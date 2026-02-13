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
