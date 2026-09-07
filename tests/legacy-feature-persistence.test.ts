// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  PERSISTED_QUERY_BUSTER,
  PERSISTED_QUERY_SCHEMA_VERSION,
  isLegacyPersistedQueryCacheKey,
  preparePersistedQueryClient,
} from "../src/api/cache/persisted-post-cache";
import { queryKeys } from "../src/api/read/query-keys";
import { ServerRequestCoordinator } from "../src/api/server-runtime";
import { UNSPECIFIED_SERVED_LENS } from "../src/domain/communities";
import { migratePersistedCommunityPost } from "../src/stores/persisted-community-post";
import { migratePendingPostV3 } from "../src/stores/pending-posts-lifecycle";

new ServerRequestCoordinator("https://node.example");

describe("legacy feature persistence", () => {
  test("bumps query schema and buster while cleaning v1-v4 namespaces", () => {
    expect(PERSISTED_QUERY_SCHEMA_VERSION).toBe(5);
    expect(PERSISTED_QUERY_BUSTER).toBe("launch-feed-cache-v5");
    expect(isLegacyPersistedQueryCacheKey("mirage-query-cache:v4%7Chttps%3A%2F%2Fnode.example%7Cmirage1viewer")).toBe(true);
    expect(isLegacyPersistedQueryCacheKey("mirage-query-cache:v5%7Chttps%3A%2F%2Fnode.example%7Cmirage1viewer")).toBe(false);
  });

  test("strips agent appendix metadata from persisted community posts", () => {
    const migrated = migratePersistedCommunityPost({
      id: "p1",
      community: "news",
      title: "Hello",
      viewedAt: 9,
      agentEdited: true,
      agentEditsMeta: { bot: "1" },
      appendices: [{ agent: "mirage1agent", text: "note" }],
      agent_edited: true,
      agent_edits_meta: { bot: "1" },
    });
    expect(migrated).toEqual({
      id: "p1",
      community: "news",
      title: "Hello",
      viewedAt: 9,
    });
    expect(migrated).not.toHaveProperty("appendices");
    expect(migrated).not.toHaveProperty("agentEdited");
  });

  test("pending migration preserves authored data and drops agent fields", () => {
    const migrated = migratePendingPostV3({
      post_id: "pending-1",
      user_id: "user",
      username: "user",
      timestamp: 1,
      community: "bitcoin",
      root_community: "bitcoin",
      title: "kept",
      content: "body",
      optimistic_status: "pending",
      agent_edited: true,
      agent_edits_meta: { x: "1" },
      appendices: [{ agent: "mirage1agent", text: "note" }],
      lens: UNSPECIFIED_SERVED_LENS,
      thread_locked: false,
    });
    expect(migrated?.title).toBe("kept");
    expect(migrated?.community).toBe("bitcoin");
    expect(migrated).not.toHaveProperty("agent_edited");
    expect(migrated).not.toHaveProperty("appendices");
  });

  test("does not persist retired reward summaries in launch cache", () => {
    const launchKey = queryKeys.posts({
      feed: "home",
      by: "magic",
      limit: 10,
      address: "mirage1viewer",
    });
    const prepared = preparePersistedQueryClient(
      {
        timestamp: 1,
        buster: "test",
        clientState: {
          mutations: [],
          queries: [
            {
              queryKey: launchKey,
              state: {
                status: "success",
                dataUpdatedAt: 1,
                data: {
                  pages: [{
                    posts: [{
                      post_id: "p1",
                      user_id: "mirage1author",
                      username: "author",
                      timestamp: 1,
                      community: "bitcoin",
                      root_community: "bitcoin",
                      lens: UNSPECIFIED_SERVED_LENS,
                      thread_locked: false,
                      agent_edited: true,
                      appendices: [{ agent: "x", text: "y" }],
                    }],
                  }],
                  pageParams: [1],
                },
              },
            },
            {
              queryKey: ["server", "https://node.example", "rewards", "summary", "mirage1viewer"],
              state: {
                status: "success",
                data: { daily_quests: [], pending_rewards: [] },
              },
            },
          ],
        },
      },
      `v5|https://node.example|mirage1viewer`,
    );
    expect(prepared.metrics.queryCount).toBe(1);
    const post = prepared.client.clientState.queries[0].state.data.pages[0].posts[0];
    expect(post).not.toHaveProperty("agent_edited");
    expect(post).not.toHaveProperty("appendices");
  });
});
