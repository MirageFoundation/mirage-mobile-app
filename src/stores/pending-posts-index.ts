type PendingPostIdentity = { post_id: string };

export type PendingPostIndex<T extends PendingPostIdentity> = Record<string, T>;

export const normalizePendingPostId = (postId: string): string =>
  postId.toLowerCase();

export function buildPendingPostIndex<T extends PendingPostIdentity>(
  posts: readonly T[],
): PendingPostIndex<T> {
  const index: PendingPostIndex<T> = {};
  for (const post of posts) {
    index[normalizePendingPostId(post.post_id)] = post;
  }
  return index;
}

export const selectPendingPost = <T extends PendingPostIdentity>(
  index: PendingPostIndex<T>,
  postId: string,
): T | undefined => index[normalizePendingPostId(postId)];
