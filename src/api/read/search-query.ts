import { normalizeTopicName } from "@/src/domain/topics";

/**
 * Dedicated `/search_topics` query.
 * Topics are case-insensitive node identities; strip a leading `#` so
 * `#Bitcoin` and `Bitcoin` hit the same lowercase request.
 */
export function normalizeTopicSearchQuery(
  query: string | null | undefined,
): string {
  const trimmed = (query ?? "").trim();
  if (trimmed.startsWith("#")) {
    return normalizeTopicName(trimmed.slice(1));
  }
  return normalizeTopicName(trimmed);
}

/**
 * Unified `/search` query as sent to the node and stored in the query key.
 *
 * Topic searches (`type === "topics"` or a `#topic` prefix) are lowercased.
 * User/post/general searches are only trimmed so full-text case is preserved.
 */
export function normalizeSearchRequestQuery(
  query: string | null | undefined,
  type?: string | null,
): string {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("#")) {
    const topic = normalizeTopicName(trimmed.slice(1));
    return topic ? `#${topic}` : "";
  }

  if (type === "topics") {
    return normalizeTopicName(trimmed);
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
