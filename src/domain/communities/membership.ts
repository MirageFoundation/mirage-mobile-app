import { normalizeCommunitySlug } from "./identity";

/**
 * Community identity for membership state.
 *
 * Communities are case-preserving for display but case-insensitive for identity.
 * Join writes always store lowercase slugs, so membership reads and writes must
 * go through these helpers.
 */

export function buildJoinedCommunitySet(
  communities: Iterable<string> | null | undefined,
): ReadonlySet<string> {
  const normalized = new Set<string>();
  if (!communities) return normalized;
  for (const community of communities) {
    const slug = normalizeCommunitySlug(community);
    if (slug) normalized.add(slug);
  }
  return normalized;
}

export function isCommunityJoined(
  joinedCommunities: ReadonlySet<string> | readonly string[] | null | undefined,
  community: string | null | undefined,
): boolean {
  const slug = normalizeCommunitySlug(community);
  if (!slug || !joinedCommunities) return false;

  if (joinedCommunities instanceof Set) {
    if (joinedCommunities.has(slug)) return true;
    for (const candidate of joinedCommunities) {
      if (normalizeCommunitySlug(candidate) === slug) return true;
    }
    return false;
  }

  return (joinedCommunities as readonly string[]).some(
    (candidate) => normalizeCommunitySlug(candidate) === slug,
  );
}

/**
 * Apply a join/leave to a cached joined-community list, storing the
 * normalized slug so an optimistic entry matches what the server will return.
 */
export function toggleJoinedCommunities(
  joinedCommunities: readonly string[] | null | undefined,
  community: string,
  shouldJoin: boolean,
): string[] {
  const slug = normalizeCommunitySlug(community);
  const remaining = (joinedCommunities ?? []).filter(
    (candidate) => normalizeCommunitySlug(candidate) !== slug,
  );
  if (!slug || !shouldJoin) return remaining;
  return [...remaining, slug];
}
