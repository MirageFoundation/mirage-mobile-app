import type { PostsResponse } from "@/src/api/types";

export const STALE_CACHED_PAGE_GAP_SECONDS = 60 * 60 * 2;

export type InfinitePostsData = {
  pages: PostsResponse[];
  pageParams: unknown[];
};

export type InfinitePostsRefreshMode = "prepend" | "replace-top";

type MergeInfinitePostsRefreshInput = {
  existing?: InfinitePostsData | null;
  incomingPages: PostsResponse[];
  mode: InfinitePostsRefreshMode;
  replaceIfNoOverlap?: boolean;
  staleGapSeconds?: number;
};

function collectPostIds(pages: PostsResponse[]): Set<string> {
  const ids = new Set<string>();
  for (const page of pages) {
    for (const post of page.posts) ids.add(post.post_id);
  }
  return ids;
}

function uniquePosts(pages: PostsResponse[]): PostsResponse["posts"] {
  const seen = new Set<string>();
  const posts: PostsResponse["posts"] = [];
  for (const page of pages) {
    for (const post of page.posts) {
      if (seen.has(post.post_id)) continue;
      seen.add(post.post_id);
      posts.push(post);
    }
  }
  return posts;
}

function numberedPageParams(pageCount: number): number[] {
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

function hasStaleLatestTail(
  existing: InfinitePostsData,
  incomingFirstPage: PostsResponse,
  staleGapSeconds: number,
): boolean {
  if (existing.pages.length < 2 || incomingFirstPage.posts.length === 0) return false;
  const firstPageOldestTimestamp = Math.min(
    ...incomingFirstPage.posts.map((post) => post.timestamp),
  );
  const nextCachedPageNewestTimestamp = existing.pages[1]?.posts?.[0]?.timestamp;
  if (
    !Number.isFinite(firstPageOldestTimestamp) ||
    !Number.isFinite(nextCachedPageNewestTimestamp)
  ) {
    return false;
  }
  return firstPageOldestTimestamp - nextCachedPageNewestTimestamp >= staleGapSeconds;
}

export function mergeInfinitePostsRefresh({
  existing,
  incomingPages,
  mode,
  replaceIfNoOverlap = false,
  staleGapSeconds = STALE_CACHED_PAGE_GAP_SECONDS,
}: MergeInfinitePostsRefreshInput): InfinitePostsData {
  const incoming = incomingPages.filter((page) => Array.isArray(page?.posts));
  if (incoming.length === 0) {
    return existing ?? { pages: [], pageParams: [] };
  }

  if (!existing?.pages?.length) {
    return {
      pages: incoming,
      pageParams: numberedPageParams(incoming.length),
    };
  }

  if (mode === "prepend" && hasStaleLatestTail(existing, incoming[0], staleGapSeconds)) {
    return {
      pages: incoming,
      pageParams: numberedPageParams(incoming.length),
    };
  }

  const existingIds = collectPostIds(existing.pages);
  const incomingPosts = uniquePosts(incoming);
  const hasOverlap = incomingPosts.some((post) => existingIds.has(post.post_id));

  if (!hasOverlap && replaceIfNoOverlap) {
    return {
      pages: incoming,
      pageParams: numberedPageParams(incoming.length),
    };
  }

  if (mode === "prepend") {
    const newPosts = incomingPosts.filter((post) => !existingIds.has(post.post_id));
    if (newPosts.length === 0) return existing;
    return {
      pages: [
        { ...existing.pages[0], posts: [...newPosts, ...existing.pages[0].posts] },
        ...existing.pages.slice(1),
      ],
      pageParams: existing.pageParams ?? numberedPageParams(existing.pages.length),
    };
  }

  const incomingIds = new Set(incomingPosts.map((post) => post.post_id));
  const leftoverPages = existing.pages
    .map((page) => ({
      ...page,
      posts: page.posts.filter((post) => !incomingIds.has(post.post_id)),
    }))
    .filter((page) => page.posts.length > 0);
  const pages = [...incoming, ...leftoverPages];
  return {
    pages,
    pageParams: numberedPageParams(pages.length),
  };
}

export async function fetchAndMergeInfinitePostsRefresh({
  existing,
  fetchPage,
  fetchAllNew = false,
  mode,
  maxPages = 10,
  firstPage,
}: {
  existing?: InfinitePostsData | null;
  fetchPage: (page: number) => Promise<PostsResponse>;
  fetchAllNew?: boolean;
  mode: InfinitePostsRefreshMode;
  maxPages?: number;
  firstPage?: PostsResponse | null;
}): Promise<{ data: InfinitePostsData; refreshedPageCount: number }> {
  const incomingPages = [firstPage ?? await fetchPage(1)];

  if (fetchAllNew && existing?.pages?.length) {
    const existingIds = collectPostIds(existing.pages);
    let hasOverlap = incomingPages[0].posts.some((post) => existingIds.has(post.post_id));
    let nextPage = 2;
    while (!hasOverlap && incomingPages[0].has_more && nextPage <= maxPages) {
      const page = await fetchPage(nextPage);
      incomingPages.push(page);
      hasOverlap = page.posts.some((post) => existingIds.has(post.post_id));
      if (!page.has_more) break;
      nextPage += 1;
    }
  }

  return {
    data: mergeInfinitePostsRefresh({
      existing,
      incomingPages,
      mode,
      replaceIfNoOverlap: fetchAllNew,
    }),
    refreshedPageCount: incomingPages.length,
  };
}
