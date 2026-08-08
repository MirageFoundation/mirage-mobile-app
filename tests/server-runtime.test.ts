// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { queryKeys } from "../src/api/read/query-keys";
import {
  ServerRequestCoordinator,
  StaleServerResponseError,
  getServerIdentity,
  normalizeServerBaseUrl,
} from "../src/api/server-runtime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10 && !predicate(); attempt += 1) {
    await Promise.resolve();
  }
  expect(predicate()).toBe(true);
}

describe("server query identity", () => {
  test("normalizes equivalent server URLs to one identity", () => {
    expect(normalizeServerBaseUrl(" MIRAGE.TALK/ ")).toBe("https://mirage.talk");
    expect(normalizeServerBaseUrl("https://MIRAGE.TALK:443///?ignored=1#hash")).toBe(
      "https://mirage.talk",
    );
  });

  test("prefixes every centralized query-key factory", () => {
    const coordinator = new ServerRequestCoordinator("https://one.example/");
    expect(getServerIdentity()).toBe("https://one.example");

    for (const [name, factory] of Object.entries(queryKeys)) {
      const key = (factory as (...args: unknown[]) => readonly unknown[])();
      expect(key.slice(0, 2), name).toEqual(["server", "https://one.example"]);
    }

    coordinator.replaceImmediately("HTTPS://TWO.EXAMPLE/");
    expect(queryKeys.postsRoot().slice(0, 2)).toEqual([
      "server",
      "https://two.example",
    ]);
  });
});

describe("viewer query identity", () => {
  const viewerA = " MIRAGE1VIEWERA ";
  const viewerB = "mirage1viewerb";

  test("separates personalized data with otherwise identical parameters", () => {
    const pairs = [
      [
        queryKeys.posts({ feed: "home", address: viewerA }),
        queryKeys.posts({ feed: "home", address: viewerB }),
      ],
      [
        queryKeys.userPosts("MIRAGE1OWNER", viewerA, { type: "comments" }),
        queryKeys.userPosts("MIRAGE1OWNER", viewerB, { type: "comments" }),
      ],
      [
        queryKeys.comments("post-1", viewerA),
        queryKeys.comments("post-1", viewerB),
      ],
      [
        queryKeys.search("mirage", "posts", 20, "sensitive", viewerA),
        queryKeys.search("mirage", "posts", 20, "sensitive", viewerB),
      ],
      [
        queryKeys.topics(20, "sensitive", viewerA),
        queryKeys.topics(20, "sensitive", viewerB),
      ],
    ];

    for (const [first, second] of pairs) {
      expect(first).not.toEqual(second);
    }
  });

  test("uses one stable anonymous identity and normalizes address casing", () => {
    expect(queryKeys.comments("post-1", undefined)).toEqual(
      queryKeys.comments("post-1", null),
    );
    expect(queryKeys.posts({ feed: "home" })).toEqual(
      queryKeys.posts({ feed: "home", address: "" }),
    );
    expect(queryKeys.search("mirage", "posts", 20, undefined, undefined)).toEqual(
      queryKeys.search("mirage", "posts", 20, undefined, null),
    );
    expect(queryKeys.profile(" MIRAGE1ACCOUNT ")).toEqual(
      queryKeys.profile("mirage1account"),
    );
    expect(queryKeys.comments("post-1", " MIRAGE1VIEWER ")).toEqual(
      queryKeys.comments("post-1", "mirage1viewer"),
    );
  });

  test("keeps owner and viewer cache roots aligned with full user-post keys", () => {
    const key = queryKeys.userPosts(
      "MIRAGE1OWNER",
      viewerA,
      { type: "comments", limit: 20, allowed_tags: "sensitive" },
    );
    expect(key.slice(0, queryKeys.userPostsForOwner("mirage1owner").length)).toEqual(
      queryKeys.userPostsForOwner("mirage1owner"),
    );
    expect(
      key.slice(
        0,
        queryKeys.userPostsForViewer("mirage1owner", viewerA).length,
      ),
    ).toEqual(
      queryKeys.userPostsForViewer("mirage1owner", viewerA),
    );
  });

  test("includes every user-post response parameter with stable defaults", () => {
    const defaults = queryKeys.userPosts("owner", viewerA);
    expect(defaults).toEqual(queryKeys.userPosts("owner", viewerA, {
      type: undefined,
      limit: 10,
      allowed_tags: "sensitive",
    }));
    expect(defaults).not.toEqual(
      queryKeys.userPosts("owner", viewerA, { limit: 20 }),
    );
    expect(defaults).not.toEqual(
      queryKeys.userPosts("owner", viewerA, { allowed_tags: "" }),
    );
    expect(defaults).not.toEqual(
      queryKeys.userPosts("owner", viewerA, { type: "comments" }),
    );
  });

  test("normalizes semantically equivalent allowed-tag sets", () => {
    expect(queryKeys.userPosts("owner", viewerA, {
      allowed_tags: " adult, sensitive,adult ",
    })).toEqual(queryKeys.userPosts("owner", viewerA, {
      allowed_tags: "SENSITIVE,ADULT",
    }));
  });

  test("includes inbox limits and excludes infinite page parameters", () => {
    expect(queryKeys.inboxInfinite(viewerA)).toEqual(
      queryKeys.inboxInfinite(viewerA, { limit: 25 }),
    );
    expect(queryKeys.inboxInfinite(viewerA, { limit: 25 })).not.toEqual(
      queryKeys.inboxInfinite(viewerA, { limit: 50 }),
    );
    expect(queryKeys.inbox(viewerA, 1, { limit: 25 })).not.toEqual(
      queryKeys.inbox(viewerA, 2, { limit: 25 }),
    );
  });

  test("keeps invalidation roots aligned with every parameter variant", () => {
    const userVariants = [
      queryKeys.userPosts("owner", viewerA),
      queryKeys.userPosts("owner", viewerA, {
        type: "comments",
        limit: 20,
        allowed_tags: "adult,sensitive",
      }),
    ];
    const inboxVariants = [
      queryKeys.inbox(viewerA, 3, { limit: 10 }),
      queryKeys.inboxInfinite(viewerA, { limit: 50 }),
    ];

    for (const key of userVariants) {
      expect(key.slice(0, queryKeys.userPostsForOwner("owner").length)).toEqual(
        queryKeys.userPostsForOwner("owner"),
      );
      expect(key.slice(0, queryKeys.userPostsForViewer("owner", viewerA).length)).toEqual(
        queryKeys.userPostsForViewer("owner", viewerA),
      );
    }
    for (const key of inboxVariants) {
      expect(key.slice(0, queryKeys.inboxForAddress(viewerA).length)).toEqual(
        queryKeys.inboxForAddress(viewerA),
      );
    }
  });
});

describe("ServerRequestCoordinator", () => {
  test("captures a read URL and rejects a late response after replacement", async () => {
    const coordinator = new ServerRequestCoordinator("https://a.example");
    const response = deferred<string>();
    let capturedUrl = "";
    let wasAborted = false;
    const read = coordinator.runRead(async (context, signal) => {
      capturedUrl = context.baseUrl;
      signal.addEventListener("abort", () => {
        wasAborted = true;
      });
      return response.promise;
    });

    coordinator.replaceImmediately("https://b.example");
    response.resolve("late-a");

    expect(capturedUrl).toBe("https://a.example");
    expect(wasAborted).toBe(true);
    await expect(read).rejects.toBeInstanceOf(StaleServerResponseError);
  });

  test("waits for active writes and gates new writes during a switch", async () => {
    const coordinator = new ServerRequestCoordinator("https://a.example");
    const activeWrite = deferred<void>();
    const switchCommit = deferred<void>();
    const events: string[] = [];

    const firstWrite = coordinator.runWrite(async (context) => {
      events.push(`write-a:${context.identity}`);
      await activeWrite.promise;
    });
    const switching = coordinator.switchServer("https://b.example", {
      beforeCommit: () => {
        events.push("before-commit");
      },
      afterCommit: async () => {
        events.push("after-commit");
        await switchCommit.promise;
      },
    });
    const secondWrite = coordinator.runWrite(async (context) => {
      events.push(`write-b:${context.identity}`);
    });

    await Promise.resolve();
    expect(events).toEqual(["write-a:https://a.example"]);
    activeWrite.resolve();
    await firstWrite;
    await Promise.resolve();
    expect(events).toEqual([
      "write-a:https://a.example",
      "before-commit",
      "after-commit",
    ]);

    switchCommit.resolve();
    await switching;
    await secondWrite;
    expect(events.at(-1)).toBe("write-b:https://b.example");
  });

  test("serializes switches and restores identity when a transaction fails", async () => {
    const coordinator = new ServerRequestCoordinator("https://a.example");
    const firstCommit = deferred<void>();
    const events: string[] = [];

    const first = coordinator.switchServer("https://b.example", {
      afterCommit: async () => {
        events.push("b-start");
        await firstCommit.promise;
        events.push("b-end");
      },
    });
    const second = coordinator.switchServer("https://c.example", {
      beforeCommit: () => {
        events.push("c-start");
      },
      afterCommit: () => {
        throw new Error("bootstrap failed");
      },
      rollback: (previous, failed) => {
        events.push(`rollback:${previous.identity}:${failed?.identity}`);
      },
    });

    await waitFor(() => events.length > 0);
    expect(events).toEqual(["b-start"]);
    firstCommit.resolve();
    await first;
    await expect(second).rejects.toThrow("bootstrap failed");

    expect(events).toEqual([
      "b-start",
      "b-end",
      "c-start",
      "rollback:https://b.example:https://c.example",
    ]);
    expect(coordinator.getContext().identity).toBe("https://b.example");
    expect(coordinator.getContext().generation).toBe(3);
  });
});
