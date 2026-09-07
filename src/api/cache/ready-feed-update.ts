import type { PostsResponse } from "@/src/api/types";
import type { InfinitePostsData } from "./merge-infinite-posts-refresh";
import { selectUnseenNewerPosts } from "./feed-post-selection";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

// Offset pagination can revisit loaded rows after a prepend. Keep the original
// server page numbers, but don't mistake that bounded overlap for end-of-feed.
type UpdatedPage = PostsResponse & { backgroundOverlapThroughPage?: number };

export function getBackgroundOverlapThroughPage(pages: PostsResponse[]): number {
  return Math.max(0, ...pages.map((page) =>
    (page as UpdatedPage).backgroundOverlapThroughPage ?? 0));
}

export async function prepareReadyFeedUpdate({
  firstPage,
  fetchPage,
  by,
  baselineTimestamp,
  knownPostIds,
  maxPages = 10,
}: {
  firstPage: PostsResponse;
  fetchPage: (page: number) => Promise<PostsResponse>;
  by: "magic" | "newest";
  baselineTimestamp: number;
  knownPostIds: Iterable<string> | null;
  maxPages?: number;
}): Promise<PostsResponse["posts"]> {
  const known = new Set(knownPostIds ?? []);
  const pages = [firstPage];
  if (by === "newest") {
    while (true) {
      const last = pages[pages.length - 1];
      const connected = last.posts.some((post) =>
        known.has(post.post_id) || post.timestamp <= baselineTimestamp);
      if (connected || !last.has_more || last.posts.length === 0) break;
      // Never advertise a partial newest prefix with an unfetched gap.
      if (pages.length >= maxPages) return [];
      pages.push(await fetchPage(pages.length + 1));
    }
  }
  return selectUnseenNewerPosts(pages.flatMap((page) => page.posts), {
    baselineTimestamp,
    knownPostIds: known,
  });
}

export function mergeReadyFeedUpdate(
  existing: InfinitePostsData | undefined,
  posts: PostsResponse["posts"],
): InfinitePostsData | undefined {
  if (!existing?.pages.length) return existing;
  const known = new Set(existing.pages.flatMap((page) => page.posts.map((post) => post.post_id)));
  const additions = posts.filter((post) => {
    if (known.has(post.post_id)) return false;
    known.add(post.post_id);
    return true;
  });
  if (!additions.length) return existing;
  const tail = existing.pages[existing.pages.length - 1];
  const continuationLimit = Math.max(1, existing.pages[0].limit);
  const overlapThrough = Math.max(
    getBackgroundOverlapThroughPage(existing.pages),
    Math.ceil(tail.page * tail.limit / continuationLimit),
  ) + Math.ceil(additions.length / continuationLimit);
  const pages: UpdatedPage[] = [...existing.pages];
  pages[0] = { ...pages[0], posts: [...additions, ...pages[0].posts] };
  pages[pages.length - 1] = {
    ...pages[pages.length - 1],
    backgroundOverlapThroughPage: overlapThrough,
  };
  // Do not replace locally edited/voted rows, older pages, pageParams, or server
  // has_more/total/limit with a preview's metadata. Magic additions retain the
  // returned rank order; already-visible rows keep their reading order.
  return { ...existing, pages };
}

export function revealReadyFeedUpdate(
  queryClient: QueryClient,
  queryKey: QueryKey,
  posts: PostsResponse["posts"],
): boolean {
  const existing = queryClient.getQueryData<InfinitePostsData>(queryKey);
  if (!existing?.pages.length) return false;
  const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
  // Capture current edits/votes before cancellation synchronously reverts an
  // in-flight query. Restore them in the same tick, without awaiting network.
  void queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData<InfinitePostsData>(queryKey,
    mergeReadyFeedUpdate(existing, posts), { updatedAt });
  return true;
}
