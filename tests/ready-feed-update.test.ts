// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../src/api/read/query-keys";
import { createFeedUpdateRequestGuard } from "../src/api/cache/feed-update-request";
import {
  getBackgroundOverlapThroughPage,
  mergeReadyFeedUpdate,
  prepareReadyFeedUpdate,
  revealReadyFeedUpdate,
} from "../src/api/cache/ready-feed-update";
import { scrollFeedListToTop } from "../src/pages/home/feed-list-scroll";
import { INITIAL_PAGE_SIZE, NEXT_PAGE_SIZE } from "../src/pages/home/home-tabbed-feed-state";

const post = (id: number) => ({ post_id: String(id), timestamp: id, user_id: `u${id}`, username: `u${id}` });
const page = (ids: number[], number = 1, has_more = true) => ({
  posts: ids.map(post), page: number, limit: 10, total: 50, has_more,
});
const key = queryKeys.posts({ feed: "home", by: "newest", limit: 10, address: "viewer" });
const cached = () => ({ pages: [page([20, 19]), page([18, 17], 2)], pageParams: [1, 2], extra: "retained" });

describe("background-ready feed updates", () => {
  test("bridges newest in the background; tap reveals and scrolls with no request", async () => {
    const client = new QueryClient();
    const existing = cached();
    client.setQueryData(key, existing, { updatedAt: 123 });
    const calls: number[] = [];
    const staged = await prepareReadyFeedUpdate({
      firstPage: page([24, 23]), by: "newest", baselineTimestamp: 20,
      knownPostIds: new Set(["20", "19", "18", "17"]),
      fetchPage: async (number) => { calls.push(number); return page([22, 21, 20], number); },
    });
    // Preparation neither mutates the visible cache nor touches the list.
    expect(client.getQueryData(key)).toBe(existing);
    expect(calls).toEqual([2]);
    const scrolls: unknown[] = [];
    expect(revealReadyFeedUpdate(client, key, staged)).toBe(true);
    const scrolling = scrollFeedListToTop({
      scrollToOffset: (options) => { scrolls.push(options); return Promise.resolve(); },
    });
    expect(scrolls).toEqual([{ offset: 0, animated: false }]);
    expect(client.getQueryData(key).pages[0].posts.map((p) => p.post_id)).toEqual(["24", "23", "22", "21", "20", "19"]);
    expect(client.getQueryState(key).dataUpdatedAt).toBe(123);
    expect(calls).toEqual([2]);
    await scrolling;
    client.clear();
  });

  test("magic uses ranked first-page additions without a needless overlap crawl", async () => {
    let calls = 0;
    const staged = await prepareReadyFeedUpdate({
      firstPage: page([24, 22, 23, 24]), by: "magic", baselineTimestamp: 20,
      knownPostIds: [], fetchPage: async () => { calls++; throw Error("unnecessary request"); },
    });
    expect(staged.map((p) => p.post_id)).toEqual(["24", "22", "23"]);
    expect(calls).toBe(0);
  });

  test("unchanged, known, duplicate and old posts do not fabricate a count", async () => {
    expect(await prepareReadyFeedUpdate({
      firstPage: page([20, 19, 22, 22]), by: "newest", baselineTimestamp: 20,
      knownPostIds: ["22"], fetchPage: async () => { throw Error("unnecessary request"); },
    })).toEqual([]);
    const existing = cached();
    expect(mergeReadyFeedUpdate(existing, [post(20), post(19)])).toBe(existing);
  });

  test("bounded disconnected newest check advertises nothing instead of a gap", async () => {
    let calls = 0;
    expect(await prepareReadyFeedUpdate({
      firstPage: page([50]), by: "newest", baselineTimestamp: 20, knownPostIds: ["20"], maxPages: 2,
      fetchPage: async (number) => { calls++; return page([49], number); },
    })).toEqual([]);
    expect(calls).toBe(1);
  });

  test("a background fetch error leaves cached rows untouched", async () => {
    const existing = cached();
    const client = new QueryClient();
    client.setQueryData(key, existing);
    await expect(prepareReadyFeedUpdate({
      firstPage: page([50]), by: "newest", baselineTimestamp: 20, knownPostIds: ["20"],
      fetchPage: async () => { throw Error("offline"); },
    })).rejects.toThrow("offline");
    expect(client.getQueryData(key)).toBe(existing);
    client.clear();
  });

  test("reveal merges against current cache, retaining edits, votes, tail and cursor metadata", () => {
    const existing = cached();
    existing.pages[0].posts[0].user_vote = 1;
    existing.pages[0].posts[0].title = "edited while checking";
    existing.pages.push(page([16, 15], 3));
    existing.pageParams.push(3);
    const result = mergeReadyFeedUpdate(existing, [post(22), post(22), post(20)]);
    expect(result.pages[0].posts.map((p) => p.post_id)).toEqual(["22", "20", "19"]);
    expect(result.pages[0].posts[1]).toBe(existing.pages[0].posts[0]);
    expect(result.pages[1]).toBe(existing.pages[1]);
    expect(result.pages[2].posts).toBe(existing.pages[2].posts);
    expect(result.pageParams).toBe(existing.pageParams);
    expect(result.extra).toBe("retained");
    for (let i = 0; i < result.pages.length; i++) {
      for (const field of ["page", "limit", "total", "has_more"]) {
        expect(result.pages[i][field]).toBe(existing.pages[i][field]);
      }
    }
  });

  test("offset continuation tolerates only a bounded shifted window and page sizes match", () => {
    const result = mergeReadyFeedUpdate(cached(), Array.from({ length: 25 }, (_, i) => post(100 - i)));
    expect(getBackgroundOverlapThroughPage(result.pages)).toBe(5);
    expect(getBackgroundOverlapThroughPage(cached().pages)).toBe(0);
    expect(NEXT_PAGE_SIZE).toBe(INITIAL_PAGE_SIZE);
    expect(getBackgroundOverlapThroughPage(mergeReadyFeedUpdate(result, [post(101)]).pages)).toBe(6);
  });

  test("reveal cancels in-flight pagination before writing and cannot resurrect its response", async () => {
    const client = new QueryClient();
    client.setQueryData(key, cached());
    let resolve;
    let signal;
    const fetching = client.fetchQuery({ queryKey: key, queryFn: (context) => {
      signal = context.signal;
      return new Promise((done) => { resolve = done; });
    } }).catch(() => undefined);
    const edited = cached();
    edited.pages[0].posts[0].user_vote = 1;
    client.setQueryData(key, edited, { updatedAt: 456 });
    expect(revealReadyFeedUpdate(client, key, [post(22)])).toBe(true);
    expect(signal.aborted).toBe(true);
    resolve(cached());
    await fetching;
    expect(client.getQueryData(key).pages[0].posts[0].post_id).toBe("22");
    expect(client.getQueryData(key).pages[0].posts[1].user_vote).toBe(1);
    expect(client.getQueryState(key).dataUpdatedAt).toBe(456);
    expect(client.getQueryState(key).status).toBe("success");
    expect(revealReadyFeedUpdate(client, queryKeys.posts({ feed: "following" }), [post(22)])).toBe(false);
    client.clear();
  });
});

describe("feed check request isolation", () => {
  test.each(["server", "viewer", "lens", "tab", "allowedTags"])("rejects a pending response after %s changes", async (field) => {
    const context = { server: "a", viewer: "a", lens: "a", tab: "a", allowedTags: "a" };
    const guard = createFeedUpdateRequestGuard(() => JSON.stringify(context));
    const request = guard.start();
    expect(guard.start()).toBeNull();
    await Promise.resolve();
    context[field] = "b";
    expect(guard.isCurrent(request)).toBe(false);
    guard.finish(request);
    expect(guard.isCurrent(guard.start())).toBe(true);
    guard.cancel();
  });

  test("dismiss/refresh aborts old request; its finally cannot clear a newer check", () => {
    const guard = createFeedUpdateRequestGuard(() => "same-session");
    const old = guard.start();
    guard.cancel();
    const next = guard.start();
    guard.finish(old);
    expect(old.signal.aborted).toBe(true);
    expect(guard.isCurrent(old)).toBe(false);
    expect(guard.isCurrent(next)).toBe(true);
    expect(guard.start()).toBeNull();
    guard.cancel();
  });
});
