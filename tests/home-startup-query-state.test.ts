// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { queryKeys } from "../src/api/read/query-keys";
import { getHomeEntryState } from "../src/pages/home/home-screen-state";

const entryState = (result) => getHomeEntryState({
  isLoggedIn: false,
  isInitializing: false,
  openBrowsingEnabled: result.data?.open_browsing_enabled,
  isConfigError: result.isError,
});

describe("Home startup query transitions", () => {
  test("disabled config and in-flight bootstrap fallback stay loading until resolved", async () => {
    const client = new QueryClient();
    let resolveConfig;
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.nodeConfig(),
      queryFn: () => new Promise((resolve) => { resolveConfig = resolve; }),
      enabled: false,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(observer.getCurrentResult().fetchStatus).toBe("idle");
      expect(observer.getCurrentResult().isLoading).toBe(false);
      expect(entryState(observer.getCurrentResult())).toBe("loading");
      const fallback = observer.refetch();
      expect(observer.getCurrentResult().fetchStatus).toBe("fetching");
      expect(entryState(observer.getCurrentResult())).toBe("loading");
      resolveConfig({ open_browsing_enabled: true });
      await fallback;
      expect(entryState(observer.getCurrentResult())).toBe("feed");
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  test("503 fallback failure shows error; successful retry restores the real guest welcome", async () => {
    const client = new QueryClient();
    let fails = true;
    const observer = new QueryObserver(client, {
      queryKey: queryKeys.nodeConfig(),
      queryFn: async () => {
        if (fails) throw new Error("503 Service Unavailable");
        return { open_browsing_enabled: false };
      },
      enabled: false,
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await observer.refetch();
      expect(entryState(observer.getCurrentResult())).toBe("error");
      fails = false;
      await observer.refetch();
      expect(entryState(observer.getCurrentResult())).toBe("welcome");
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  for (const feed of ["home", "following"]) {
    for (const by of ["magic", "newest"]) {
      test(`${feed}/${by}: disabled feed is pending, success can be empty, refetch retains posts`, async () => {
        const client = new QueryClient();
        const queryKey = queryKeys.posts({ feed, by });
        let resolvePage;
        let rejectPage;
        const observer = new InfiniteQueryObserver(client, {
          queryKey,
          queryFn: () => new Promise((resolve, reject) => {
            resolvePage = resolve;
            rejectPage = reject;
          }),
          initialPageParam: 1,
          getNextPageParam: () => undefined,
          enabled: false,
          retry: false,
        });
        const unsubscribe = observer.subscribe(() => {});
        try {
          expect(observer.getCurrentResult().isPending).toBe(true);
          expect(observer.getCurrentResult().fetchStatus).toBe("idle");
          const initial = observer.refetch();
          expect(observer.getCurrentResult().isPending).toBe(true);
          resolvePage({ posts: [] });
          await initial;
          expect(observer.getCurrentResult().isSuccess).toBe(true);
          expect(observer.getCurrentResult().data.pages[0].posts).toEqual([]);
          const failed = observer.refetch();
          rejectPage(new Error("503 Service Unavailable"));
          await failed;
          expect(observer.getCurrentResult().isError).toBe(true);
          expect(observer.getCurrentResult().isPending).toBe(false);
          client.setQueryData(queryKey, { pages: [{ posts: [{ post_id: "cached" }] }], pageParams: [1] });
          const background = observer.refetch();
          expect(observer.getCurrentResult().isPending).toBe(false);
          expect(observer.getCurrentResult().isFetching).toBe(true);
          expect(observer.getCurrentResult().data.pages[0].posts).toEqual([{ post_id: "cached" }]);
          resolvePage({ posts: [{ post_id: "cached" }] });
          await background;
        } finally {
          unsubscribe();
          client.clear();
        }
      });
    }
  }

  test("Home render wiring preserves pending/error feed guards and server remount", () => {
    const home = readFileSync(new URL("../src/pages/home/home-content.tsx", import.meta.url), "utf8");
    const feed = readFileSync(new URL("../src/pages/home/home-tabbed-feed.tsx", import.meta.url), "utf8");
    const sections = readFileSync(new URL("../src/pages/home/home-screen-sections.tsx", import.meta.url), "utf8");
    expect(home).toContain('controller.entryState === "welcome"');
    expect(home).toContain("controller.retryNodeConfig()");
    expect(feed).toContain("controller.query.isPending && controller.posts.length === 0");
    expect(feed).toContain("isError={controller.query.isError}");
    expect(sections).toContain("key={controller.shareServer}");
  });
});
