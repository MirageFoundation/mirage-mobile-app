import {
  normalizeCommunitySlug,
  normalizeTypedCommunitySlug,
} from "@/src/domain/communities";

/**
 * Dedicated community search query.
 * Communities are case-insensitive identities; strip typed `[slug]`, leftover
 * `c/`, or leftover `#` so `[Bitcoin]`, `Bitcoin`, and `#Bitcoin` match.
 */
export function normalizeCommunitySearchQuery(
  query: string | null | undefined,
): string {
  return normalizeTypedCommunitySlug(query);
}

/**
 * Unified `/search` query as sent to the node and stored in the query key.
 *
 * Community searches (`type === "communities"` or a `[slug]` / leftover
 * `#community` prefix) are lowercased. User/post/general searches are only
 * trimmed so full-text case is preserved.
 */
export function normalizeSearchRequestQuery(
  query: string | null | undefined,
  type?: string | null,
): string {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("[") && trimmed.endsWith("]") && trimmed.length > 2) {
    return normalizeTypedCommunitySlug(trimmed);
  }

  if (trimmed.startsWith("#")) {
    const community = normalizeCommunitySlug(trimmed.slice(1));
    return community ? `#${community}` : "";
  }

  if (type === "communities") {
    return normalizeTypedCommunitySlug(trimmed);
  }

  return trimmed;
}

export function isDebouncedSearchPending(
  query: string | null | undefined,
  debouncedQuery: string | null,
  normalize: (value: string | null | undefined) => string,
): boolean {
  const normalized = normalize(query);
  return normalized.length > 0 && normalized !== debouncedQuery;
}
