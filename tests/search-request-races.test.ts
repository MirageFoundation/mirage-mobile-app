// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  isAbortError,
  RequestGenerationCoordinator,
} from "../src/utils/request-generation";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

type Item = { id: string };

class SearchHarness {
  readonly coordinator = new RequestGenerationCoordinator();
  results: Item[] = [];
  loading = false;
  error: string | null = null;
  offset = 0;
  hasMore = true;
  errorEvents = 0;
  signals: AbortSignal[] = [];

  activate(query: string) {
    this.loading = false;
    this.error = null;
    return this.coordinator.activate(query.trim().toLowerCase());
  }

  clear() {
    this.coordinator.invalidate();
    this.results = [];
    this.loading = false;
    this.error = null;
    this.offset = 0;
  }

  async request(active, response: Promise<Item[]>, offset = 0, append = false, limit = 2) {
    const token = this.coordinator.start(active);
    if (!token) return;
    this.signals.push(token.signal);
    this.loading = true;
    this.error = null;

    try {
      const items = await response;
      if (!this.coordinator.isCurrent(token)) return;
      if (append) {
        const ids = new Set(this.results.map((item) => item.id));
        this.results = [...this.results, ...items.filter((item) => !ids.has(item.id))];
      } else {
        this.results = items;
      }
      this.offset = offset + items.length;
      this.hasMore = items.length === limit;
    } catch (error) {
      if (!this.coordinator.isCurrent(token) || isAbortError(error)) return;
      this.errorEvents += 1;
      this.error = error instanceof Error ? error.message : "failed";
      if (!append) this.results = [];
    } finally {
      if (this.coordinator.isCurrent(token)) {
        this.loading = false;
        this.coordinator.settle(token);
      }
    }
  }
}

describe("search request generation ownership", () => {
  test("a slow mention query cannot replace a faster newer query", async () => {
    const harness = new SearchHarness();
    const slow = deferred<Item[]>();
    const fast = deferred<Item[]>();
    const a = harness.activate("a");
    const aRequest = harness.request(a, slow.promise);

    const b = harness.activate("b");
    const bRequest = harness.request(b, fast.promise);
    expect(harness.signals[0]?.aborted).toBe(true);
    fast.resolve([{ id: "b" }]);
    await bRequest;
    slow.resolve([{ id: "a" }]);
    await aRequest;

    expect(harness.results).toEqual([{ id: "b" }]);
    expect(harness.loading).toBe(false);
  });

  test("clear during a request invalidates its completion", async () => {
    const harness = new SearchHarness();
    const pending = deferred<Item[]>();
    const active = harness.activate("mention");
    const request = harness.request(active, pending.promise);

    harness.clear();
    pending.resolve([{ id: "late" }]);
    await request;

    expect(harness.results).toEqual([]);
    expect(harness.loading).toBe(false);
    expect(harness.offset).toBe(0);
  });

  test("unmount invalidation prevents state ownership by an active request", async () => {
    const harness = new SearchHarness();
    const pending = deferred<Item[]>();
    const active = harness.activate("mention");
    const request = harness.request(active, pending.promise);

    harness.coordinator.invalidate();
    pending.resolve([{ id: "after-unmount" }]);
    await request;

    expect(harness.results).toEqual([]);
    expect(harness.errorEvents).toBe(0);
  });

  test("stale and aborted failures are silent", async () => {
    const harness = new SearchHarness();
    const stale = deferred<Item[]>();
    const active = harness.activate("old");
    const request = harness.request(active, stale.promise);

    harness.activate("new");
    stale.reject(new Error("old query failed"));
    await request;

    expect(harness.error).toBe(null);
    expect(harness.errorEvents).toBe(0);
    expect(isAbortError({ code: "ERR_CANCELED" })).toBe(true);
  });

  test("a GIF query switch rejects a late page from the previous query", async () => {
    const harness = new SearchHarness();
    harness.results = [{ id: "cat-1" }];
    harness.offset = 1;
    const oldPage = deferred<Item[]>();
    const cats = harness.activate("  CATS ");
    const pageRequest = harness.request(cats, oldPage.promise, 1, true);

    const dogs = harness.activate("dogs");
    await harness.request(dogs, Promise.resolve([{ id: "dog-1" }]), 0, false);
    oldPage.resolve([{ id: "cat-2" }]);
    await pageRequest;

    expect(harness.results).toEqual([{ id: "dog-1" }]);
    expect(harness.offset).toBe(1);
  });

  test("overlapping load-more calls deterministically keep only the latest page", async () => {
    const harness = new SearchHarness();
    harness.results = [{ id: "base" }];
    harness.offset = 1;
    const first = deferred<Item[]>();
    const second = deferred<Item[]>();
    const active = harness.activate("cats");
    const firstRequest = harness.request(active, first.promise, 1, true);
    const secondRequest = harness.request(active, second.promise, 1, true);

    second.resolve([{ id: "base" }, { id: "latest" }]);
    await secondRequest;
    first.resolve([{ id: "stale" }]);
    await firstRequest;

    expect(harness.results).toEqual([{ id: "base" }, { id: "latest" }]);
    expect(harness.offset).toBe(3);
    expect(harness.hasMore).toBe(true);
  });

  test("only the latest request owns loading and error state", async () => {
    const harness = new SearchHarness();
    const stale = deferred<Item[]>();
    const latest = deferred<Item[]>();
    const oldActive = harness.activate("old");
    const oldRequest = harness.request(oldActive, stale.promise);
    const newActive = harness.activate("new");
    const newRequest = harness.request(newActive, latest.promise);

    stale.reject(new Error("stale error"));
    await oldRequest;
    expect(harness.loading).toBe(true);
    expect(harness.error).toBe(null);

    latest.reject(new Error("latest error"));
    await newRequest;
    expect(harness.loading).toBe(false);
    expect(harness.error).toBe("latest error");
    expect(harness.errorEvents).toBe(1);
  });
});
