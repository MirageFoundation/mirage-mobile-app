export function isPaidUserLevel(userLevel: number | null | undefined): boolean {
  return typeof userLevel === "number" && Number.isFinite(userLevel) && userLevel > 0;
}

export function isNonFreeTier(tier: string | null | undefined): boolean {
  const normalizedTier = tier?.trim().toLowerCase();
  return !!normalizedTier && !["free", "free tier", "free-tier", "free_tier"].includes(normalizedTier);
}

export function canSkipPoWForUser(
  userLevel: number | null | undefined,
  tier?: string | null,
): boolean {
  return isPaidUserLevel(userLevel) || isNonFreeTier(tier);
}
