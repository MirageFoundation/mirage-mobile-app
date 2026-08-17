export function collectPostIdsFromPages(
  pages: { posts?: { post_id?: string }[] }[] | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const page of pages ?? []) {
    for (const post of page.posts ?? []) {
      if (post.post_id) ids.add(post.post_id);
    }
  }
  return ids;
}

export function selectUnseenNewerPosts<T extends { post_id: string; timestamp: number }>(
  posts: T[],
  {
    baselineTimestamp,
    knownPostIds,
  }: {
    baselineTimestamp: number;
    knownPostIds?: Iterable<string> | null;
  },
): T[] {
  const known = knownPostIds instanceof Set
    ? knownPostIds
    : new Set(knownPostIds ?? []);
  return posts.filter((post) => (
    post.timestamp > baselineTimestamp && !known.has(post.post_id)
  ));
}
