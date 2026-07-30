// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import {
  getInfinitePostsQueryPolicy,
  INFINITE_POSTS_STALE_TIME,
} from "../src/api/read/infinite-posts-policy";

describe("infinite post reconciliation policy", () => {
  test("restoration pauses fetching without letting cached data disable it", () => {
    expect(
      getInfinitePostsQueryPolicy({
        isInitializing: false,
        isRestoring: true,
      }).enabled,
    ).toBe(false);

    const restored = getInfinitePostsQueryPolicy({
      isInitializing: false,
      isRestoring: false,
    });
    expect(restored).toEqual({
      enabled: true,
      staleTime: INFINITE_POSTS_STALE_TIME,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
  });

  test("respects explicit tab and auth gates only", () => {
    expect(
      getInfinitePostsQueryPolicy({
        isInitializing: false,
        isRestoring: false,
        enabled: false,
      }).enabled,
    ).toBe(false);
    expect(
      getInfinitePostsQueryPolicy({
        isInitializing: true,
        isRestoring: false,
      }).enabled,
    ).toBe(false);
  });
});

describe("TanStack infinite first-page reconciliation", () => {
  test("refreshes first-page membership/order while retaining loaded pages", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryKey = ["test", "feed"] as const;
    queryClient.setQueryData(queryKey, {
      pages: [
        { page: 1, posts: [{ post_id: "old-a" }, { post_id: "old-b" }] },
        { page: 2, posts: [{ post_id: "older-page" }] },
      ],
      pageParams: [1, 2],
    });

    const requestedPages: number[] = [];
    const result = await queryClient.fetchInfiniteQuery({
      queryKey,
      initialPageParam: 1,
      queryFn: async ({ pageParam }) => {
        requestedPages.push(pageParam);
        return pageParam === 1
          ? { page: 1, posts: [{ post_id: "new-b" }, { post_id: "new-a" }] }
          : { page: 2, posts: [{ post_id: "older-page" }] };
      },
      getNextPageParam: (lastPage) =>
        lastPage.page === 1 ? 2 : undefined,
      staleTime: 0,
    });

    expect(requestedPages).toEqual([1, 2]);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].posts.map((post) => post.post_id)).toEqual([
      "new-b",
      "new-a",
    ]);
    expect(result.pages[1].posts.map((post) => post.post_id)).toEqual([
      "older-page",
    ]);
  });
});
