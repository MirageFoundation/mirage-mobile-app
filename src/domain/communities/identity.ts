import { isValidCommunitySlug } from "./lens-selection";

export const RESERVED_COMMUNITY_SLUGS = new Set(["all", "home", "following"]);

export function normalizeCommunitySlug(
  value: string | null | undefined,
): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Strip typed `[slug]`, leftover `c/`, or leftover `#` so search matches the slug. */
export function stripCommunityReference(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^(c\/|#)+/i, "")
    .replace(/^\[/, "")
    .replace(/]$/, "");
}

export function normalizeTypedCommunitySlug(
  value: string | null | undefined,
): string {
  return normalizeCommunitySlug(stripCommunityReference(value));
}

export function isReservedCommunitySlug(value: string | null | undefined): boolean {
  return RESERVED_COMMUNITY_SLUGS.has(normalizeCommunitySlug(value));
}

export function isRoutableCommunitySlug(value: string | null | undefined): boolean {
  const slug = normalizeCommunitySlug(value);
  return isValidCommunitySlug(slug) && !isReservedCommunitySlug(slug);
}

export function communityLabel(value: string | null | undefined): string {
  const slug = normalizeCommunitySlug(value);
  return slug ? `[${slug}]` : "";
}

export function communityPath(value: string | null | undefined): string {
  const slug = normalizeCommunitySlug(value);
  if (!slug) return "/communities";
  return `/c/${encodeURIComponent(slug)}`;
}

export function communityTeamsPath(value: string | null | undefined): string {
  return `${communityPath(value)}/teams`;
}

export function communityTeamPath(
  value: string | null | undefined,
  teamId: string | number,
): string {
  return `${communityTeamsPath(value)}/${encodeURIComponent(String(teamId))}`;
}
