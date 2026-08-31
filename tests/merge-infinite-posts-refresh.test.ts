// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  mergeInfinitePostsRefresh,
  STALE_CACHED_PAGE_GAP_SECONDS,
} from "../src/api/cache/merge-infinite-posts-refresh";
import type { PostsResponse } from "../src/api/types";

function page(
  pageNumber: number,
  posts: { post_id: string; timestamp: number }[],
  extras: Partial<PostsResponse> = {},
): PostsResponse {
  return {
    posts: posts as PostsResponse["posts"],
    total: posts.length,
    page: pageNumber,
    limit: 10,
    has_more: true,
    ...extras,
  };
}

describe("mergeInfinitePostsRefresh", () => {
  test("uses incoming pages when the cache is empty", () => {
    const incoming = [page(1, [{ post_id: "a", timestamp: 3 }])];
    expect(mergeInfinitePostsRefresh({
      existing: undefined,
      incomingPages: incoming,
      mode: "prepend",
    })).toEqual({
      pages: incoming,
      pageParams: [1],
    });
  });

  test("prepends only unseen latest posts and keeps older pages", () => {
    const existing = {
      pages: [
        page(1, [{ post_id: "b", timestamp: 2 }, { post_id: "c", timestamp: 1 }]),
        page(2, [{ post_id: "d", timestamp: 0 }]),
      ],
      pageParams: [1, 2],
    };
    const merged = mergeInfinitePostsRefresh({
      existing,
      incomingPages: [page(1, [
        { post_id: "a", timestamp: 4 },
        { post_id: "b", timestamp: 2 },
      ])],
      mode: "prepend",
    });

    expect(merged.pages.map((item) => item.posts.map((post) => post.post_id))).toEqual([
      ["a", "b", "c"],
      ["d"],
    ]);
    expect(merged.pageParams).toEqual([1, 2]);
  });

  test("replace-top puts the new ranking first and keeps unread leftovers", () => {
    const existing = {
      pages: [
        page(1, [{ post_id: "old-1", timestamp: 2 }, { post_id: "keep", timestamp: 1 }]),
        page(2, [{ post_id: "old-2", timestamp: 0 }]),
      ],
      pageParams: [1, 2],
    };
    const incoming = [page(1, [
      { post_id: "new-1", timestamp: 5 },
      { post_id: "keep", timestamp: 1 },
    ])];
    const merged = mergeInfinitePostsRefresh({
      existing,
      incomingPages: incoming,
      mode: "replace-top",
    });

    expect(merged.pages.map((item) => item.posts.map((post) => post.post_id))).toEqual([
      ["new-1", "keep"],
      ["old-1"],
      ["old-2"],
    ]);
  });

  test("replaces the whole cache when fetch-all-new never overlaps", () => {
    const existing = {
      pages: [page(1, [{ post_id: "old", timestamp: 1 }])],
      pageParams: [1],
    };
    const incoming = [page(1, [{ post_id: "new", timestamp: 99 }])];
    const merged = mergeInfinitePostsRefresh({
      existing,
      incomingPages: incoming,
      mode: "prepend",
      replaceIfNoOverlap: true,
    });

    expect(merged.pages).toEqual(incoming);
  });

  test("drops a disconnected latest tail after a long gap", () => {
    const existing = {
      pages: [
        page(1, [{ post_id: "mid", timestamp: 20 }]),
        page(2, [{ post_id: "old", timestamp: 1 }]),
      ],
      pageParams: [1, 2],
    };
    const incoming = [page(1, [{
      post_id: "fresh",
      timestamp: 1 + STALE_CACHED_PAGE_GAP_SECONDS + 20,
    }])];
    const merged = mergeInfinitePostsRefresh({
      existing,
      incomingPages: incoming,
      mode: "prepend",
    });

    expect(merged.pages).toEqual(incoming);
    expect(merged.pageParams).toEqual([1]);
  });
});
