import { describe, expect, test } from "bun:test";

import {
  sanitizePersistedPostQueries,
  sanitizePersistedPostsData,
} from "../src/api/cache/persisted-post-cache.ts";

const post = (id, overrides = {}) => ({
  post_id: id,
  user_id: "user",
  username: "user",
  timestamp: 1,
  media: ["https://cdn.example.com/video.m3u8"],
  ...overrides,
});

const response = (posts) => ({
  posts,
  total: posts.length,
  page: 1,
  limit: 10,
  has_more: false,
});

const persistedClient = (queries) => ({
  timestamp: 1,
  buster: "pending-post-lifecycle-v2",
  clientState: { mutations: [], queries },
});

const query = (queryKey, data) => ({
  queryKey,
  queryHash: JSON.stringify(queryKey),
  state: { data, status: "success" },
});

describe("persisted post cache", () => {
  test("preserves a valid server feed without cloning it", () => {
    const data = {
      pages: [response([post("one"), post("two")])],
      pageParams: [1],
    };
    expect(sanitizePersistedPostsData(data)).toBe(data);
  });

  test("removes only optimistic and device-local entries", () => {
    const data = {
      pages: [response([
        post("server"),
        post("optimistic-post-1", { optimistic_status: "pending" }),
        post("confirmed-local", {
          optimistic_video_preview_until: Date.now() + 60_000,
          media: ["file:///tmp/video.mp4"],
        }),
      ])],
      pageParams: [1],
    };

    const result = sanitizePersistedPostsData(data);
    expect(result.pages[0].posts.map((item) => item.post_id)).toEqual(["server"]);
  });

  test("keeps safe feeds and unrelated queries during restoration", () => {
    const client = persistedClient([
      query(["posts", { feed: "home" }], {
        pages: [response([
          post("server"),
          post("local", { media: ["file:///tmp/video.mp4"] }),
        ])],
        pageParams: [1],
      }),
      query(["config"], { version: 1 }),
    ]);

    const result = sanitizePersistedPostQueries(client);
    expect(result.buster).toBe(client.buster);
    expect(result.clientState.queries).toHaveLength(2);
    expect(result.clientState.queries[0].state.data.pages[0].posts)
      .toEqual([post("server")]);
    expect(result.clientState.queries[1]).toBe(client.clientState.queries[1]);
  });

  test("drops only a malformed feed query", () => {
    const client = persistedClient([
      query(["posts", { feed: "home" }], { pages: [{ posts: null }] }),
      query(["config"], { version: 1 }),
    ]);

    const result = sanitizePersistedPostQueries(client);
    expect(result.clientState.queries.map((item) => item.queryKey[0]))
      .toEqual(["config"]);
  });
});
