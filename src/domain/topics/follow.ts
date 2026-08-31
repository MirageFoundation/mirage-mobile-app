/**
 * Topic identity for follow state.
 *
 * Topics are case-preserving for display but case-insensitive for identity.
 * `get_topics` returns the original-cased topic as it was typed on the first
 * post (`#Bitcoin`), while a follow is always written lowercase: the write
 * endpoint sends `topic.toLowerCase()` and the node lowercases again before
 * building `MsgFollowTopic`, so `get_user_followed().followed_topics` only ever
 * contains lowercase names.
 *
 * Comparing the two directly reads an already-followed `#Bitcoin` as unfollowed
 * and makes an optimistic follow disappear as soon as the server list comes
 * back. Every follow-state read and write must go through these helpers.
 */

export function normalizeTopicName(topic: string | null | undefined): string {
  return (topic ?? "").trim().toLowerCase();
}

export function buildFollowedTopicSet(
  topics: Iterable<string> | null | undefined,
): ReadonlySet<string> {
  const normalized = new Set<string>();
  if (!topics) return normalized;
  for (const topic of topics) {
    const name = normalizeTopicName(topic);
    if (name) normalized.add(name);
  }
  return normalized;
}

export function isTopicFollowed(
  followedTopics: ReadonlySet<string> | readonly string[] | null | undefined,
  topic: string | null | undefined,
): boolean {
  const name = normalizeTopicName(topic);
  if (!name || !followedTopics) return false;

  if (followedTopics instanceof Set) {
    if (followedTopics.has(name)) return true;
    // Be defensive for screen-owned Sets that were not created by
    // buildFollowedTopicSet (the web client normalizes every comparison too).
    for (const candidate of followedTopics) {
      if (normalizeTopicName(candidate) === name) return true;
    }
    return false;
  }

  return (followedTopics as readonly string[]).some(
    (candidate) => normalizeTopicName(candidate) === name,
  );
}

/**
 * Apply a follow/unfollow to a cached `followed_topics` list, storing the
 * normalized name so an optimistic entry matches what the server will return.
 */
export function toggleFollowedTopics(
  followedTopics: readonly string[] | null | undefined,
  topic: string,
  shouldFollow: boolean,
): string[] {
  const name = normalizeTopicName(topic);
  const remaining = (followedTopics ?? []).filter(
    (candidate) => normalizeTopicName(candidate) !== name,
  );
  if (!name || !shouldFollow) return remaining;
  return [...remaining, name];
}
