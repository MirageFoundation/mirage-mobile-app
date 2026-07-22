// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  PERSISTED_QUERY_MAX_BYTES,
  PERSISTED_QUERY_SCHEMA_VERSION,
  buildPersistedQueryNamespace,
  buildPersistedQueryStorageKey,
  isLaunchCriticalFeedQuery,
  preparePersistedQueryClient,
  restorePersistedQueryClient,
} from "../src/api/cache/persisted-post-cache";
import { queryKeys } from "../src/api/read/query-keys";
import { ServerRequestCoordinator } from "../src/api/server-runtime";

new ServerRequestCoordinator("https://node.example");

function post(id: string, content = "content") {
  return {
    post_id: id,
    user_id: "mirage1author",
    username: "author",
    timestamp: 1,
    content,
  };
}

function persistedQuery(
  key: readonly unknown[],
  ids: string[],
  updatedAt = 1,
) {
  return {
    queryKey: key,
    queryHash: JSON.stringify(key),
    state: {
      status: "success",
      dataUpdatedAt: updatedAt,
      data: {
        pages: ids.map((id, index) => ({
          posts: [post(id)],
          page: index + 1,
          has_more: index < ids.length - 1,
        })),
        pageParams: ids.map((_, index) => index + 1),
      },
    },
  };
}

function client(queries: unknown[]) {
  return {
    timestamp: 1,
    buster: "test",
    clientState: { mutations: [{ should: "drop" }], queries },
  };
}

const namespace = buildPersistedQueryNamespace(
  "HTTPS://NODE.EXAMPLE/",
  " MIRAGE1VIEWER ",
);
const launchKey = queryKeys.posts({
  feed: "home",
  by: "magic",
  limit: 10,
  address: "mirage1viewer",
});

describe("persisted query namespace", () => {
  test("isolates normalized server and viewer identities", () => {
    expect(namespace).toBe(
      `v${PERSISTED_QUERY_SCHEMA_VERSION}|https://node.example|mirage1viewer`,
    );
    expect(
      buildPersistedQueryNamespace("https://node.example", "MIRAGE1VIEWER"),
    ).toBe(namespace);
    expect(
      buildPersistedQueryNamespace("https://other.example", "mirage1viewer"),
    ).not.toBe(namespace);
    expect(
      buildPersistedQueryNamespace("https://node.example", undefined),
    ).not.toBe(namespace);
    expect(buildPersistedQueryStorageKey(namespace)).toContain(
      "mirage-query-cache:",
    );
  });
});

describe("persisted launch feed allowlist", () => {
  test("allows only namespaced magic home/following feeds", () => {
    expect(isLaunchCriticalFeedQuery(launchKey)).toBe(true);
    expect(
      isLaunchCriticalFeedQuery(
        queryKeys.posts({ feed: "following", by: "magic" }),
      ),
    ).toBe(true);
    expect(
      isLaunchCriticalFeedQuery(
        queryKeys.posts({ feed: "home", by: "newest" }),
      ),
    ).toBe(false);
    expect(isLaunchCriticalFeedQuery(queryKeys.profile("mirage1viewer"))).toBe(
      false,
    );
  });

  test("drops arbitrary queries and caps infinite data to the first page", () => {
    const prepared = preparePersistedQueryClient(
      client([
        persistedQuery(launchKey, ["first", "second", "third"]),
        persistedQuery(queryKeys.profile("mirage1viewer"), ["profile"]),
      ]),
      namespace,
    );
    const queries = prepared.client.clientState.queries;

    expect(queries).toHaveLength(1);
    expect(queries[0].state.data.pages).toHaveLength(1);
    expect(queries[0].state.data.pages[0].posts[0].post_id).toBe("first");
    expect(queries[0].state.data.pageParams).toEqual([1]);
    expect(prepared.client.clientState.mutations).toEqual([]);
    expect(prepared.metrics.queryCount).toBe(1);
    expect(prepared.metrics.pageCount).toBe(1);
    expect(prepared.metrics.bytes).toBeLessThanOrEqual(PERSISTED_QUERY_MAX_BYTES);

    const wrongNamespace = preparePersistedQueryClient(
      client([persistedQuery(launchKey, ["first"])]),
      buildPersistedQueryNamespace("https://other.example", "mirage1viewer"),
    );
    expect(wrongNamespace.metrics.queryCount).toBe(0);
  });

  test("filters optimistic and device-local posts and drops malformed feeds", () => {
    const mixed = persistedQuery(launchKey, ["server"]);
    mixed.state.data.pages[0].posts.push(
      {
        ...post("optimistic-post-1"),
        optimistic_status: "pending",
      },
      {
        ...post("local-media"),
        media: ["file:///tmp/video.mp4"],
      },
      {
        ...post("local-thumbnail"),
        thumbnail: "content://local/thumbnail.jpg",
      },
    );
    const malformed = persistedQuery(
      queryKeys.posts({
        feed: "following",
        by: "magic",
        address: "mirage1viewer",
      }),
      ["malformed"],
    );
    malformed.state.data.pages[0].posts = null;

    const prepared = preparePersistedQueryClient(
      client([malformed, mixed]),
      namespace,
    );
    const queries = prepared.client.clientState.queries;

    expect(queries).toHaveLength(1);
    expect(queries[0].state.data.pages[0].posts).toEqual([post("server")]);
  });

  test("retains newest queries only while respecting the byte cap", () => {
    const newest = persistedQuery(
      queryKeys.posts({
        feed: "home",
        by: "magic",
        topic: "new",
        address: "mirage1viewer",
      }),
      ["new"],
      20,
    );
    newest.state.data.pages[0].posts[0].content = "x".repeat(1200);
    const older = persistedQuery(
      queryKeys.posts({
        feed: "following",
        by: "magic",
        topic: "old",
        address: "mirage1viewer",
      }),
      ["old"],
      10,
    );
    older.state.data.pages[0].posts[0].content = "y".repeat(1200);

    const one = preparePersistedQueryClient(client([newest]), namespace);
    const capped = preparePersistedQueryClient(
      client([older, newest]),
      namespace,
      one.metrics.bytes + 20,
    );

    expect(capped.metrics.queryCount).toBe(1);
    expect(capped.metrics.bytes).toBeLessThanOrEqual(one.metrics.bytes + 20);
    expect(capped.client.clientState.queries[0].state.data.pages[0].posts[0].post_id).toBe(
      "new",
    );
  });
});

describe("persisted payload restore", () => {
  test("rejects malformed, old-schema, wrong-namespace, and oversized payloads", () => {
    expect(restorePersistedQueryClient("not json", namespace)).toBeNull();
    expect(
      restorePersistedQueryClient(
        JSON.stringify({
          schemaVersion: PERSISTED_QUERY_SCHEMA_VERSION - 1,
          namespace,
          client: client([]),
        }),
        namespace,
      ),
    ).toBeNull();

    const prepared = preparePersistedQueryClient(client([]), namespace);
    expect(
      restorePersistedQueryClient(prepared.serialized, `${namespace}-other`),
    ).toBeNull();
    expect(
      restorePersistedQueryClient(
        prepared.serialized,
        namespace,
        prepared.metrics.bytes - 1,
      ),
    ).toBeNull();
  });

  test("reports query, page, byte, and duration metrics without identities", () => {
    let clock = 10;
    const now = () => {
      const value = clock;
      clock += 5;
      return value;
    };
    const prepared = preparePersistedQueryClient(
      client([persistedQuery(launchKey, ["first", "second"])]),
      namespace,
      PERSISTED_QUERY_MAX_BYTES,
      now,
    );
    const restored = restorePersistedQueryClient(
      prepared.serialized,
      namespace,
      PERSISTED_QUERY_MAX_BYTES,
      now,
    );

    expect(restored).not.toBeNull();
    expect(restored?.metrics).toEqual({
      queryCount: 1,
      pageCount: 1,
      bytes: prepared.metrics.bytes,
      durationMs: 15,
    });
    expect(Object.keys(restored!.metrics).sort()).toEqual([
      "bytes",
      "durationMs",
      "pageCount",
      "queryCount",
    ]);
  });
});
