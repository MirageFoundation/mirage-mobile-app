import { isValidCommunitySlug, normalizeCommunitySlug } from "@/src/domain/communities";

export function migratePersistedCommunityPost<T extends Record<string, unknown>>(
  entry: T,
): (Omit<T, "topic"> & { community: string }) | null {
  const canonical = typeof entry.community === "string"
    ? normalizeCommunitySlug(entry.community)
    : "";
  const legacyTopic = (entry as { topic?: unknown }).topic;
  const legacy = typeof legacyTopic === "string"
    ? normalizeCommunitySlug(legacyTopic)
    : "";
  const community = (
    isValidCommunitySlug(canonical) ? canonical : ""
  ) || (
    isValidCommunitySlug(legacy) ? legacy : ""
  );
  if (!community) return null;
  const {
    topic: _topic,
    agentEdited: _agentEdited,
    agentEditsMeta: _agentEditsMeta,
    appendices: _appendices,
    agent_edited: _agent_edited,
    agent_edits_meta: _agent_edits_meta,
    ...rest
  } = entry as T & {
    topic?: unknown;
    agentEdited?: unknown;
    agentEditsMeta?: unknown;
    appendices?: unknown;
    agent_edited?: unknown;
    agent_edits_meta?: unknown;
  };
  return { ...rest, community } as Omit<T, "topic"> & { community: string };
}
