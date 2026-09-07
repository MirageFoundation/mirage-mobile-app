// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../src/api/read/query-keys";
import {
  consumeBootstrapFeedPreview,
  hydrateBootstrapViewCache,
} from "../src/api/cache/bootstrap-cache";

const feed = {
  kind: "feed",
  feed: "home",
  posts: [{ id: "post-1" }],
  page: 1,
  limit: 10,
  total: 1,
  has_more: false,
};

const response = {
  node_config: null,
  chain_config: null,
  user_status: null,
  user_followed: null,
  user_blocked: null,
  view: feed,
};

describe("bootstrap feed cache hydration", () => {
  test("does not seed a feed when bootstrap has no requested view", () => {
    const queryClient = new QueryClient();
    hydrateBootstrapViewCache(
      queryClient,
      { ...response, view: null },
      {},
    );

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  test("hydrates the matching infinite-query cache shape", () => {
    const queryClient = new QueryClient();
    const params = {
      address: "MIRAGE1ABC",
      view: "feed:home" as const,
      by: "magic" as const,
      allowed_tags: "sensitive",
      limit: 10,
    };

    hydrateBootstrapViewCache(queryClient, response, params);

    expect(
      queryClient.getQueryData(
        queryKeys.posts({
          address: "MIRAGE1ABC",
          feed: "home",
          by: "magic",
          allowed_tags: "sensitive",
          limit: 10,
          page: undefined,
        }),
      ),
    ).toEqual({ pages: [feed], pageParams: [1] });
  });

  test("keeps an existing cached feed and stashes bootstrap for the new-posts pill", () => {
    const queryClient = new QueryClient();
    const params = {
      address: "MIRAGE1ABC",
      view: "feed:home" as const,
      by: "magic" as const,
      allowed_tags: "sensitive",
      limit: 10,
    };
    const queryKey = queryKeys.posts({
      address: "MIRAGE1ABC",
      feed: "home",
      by: "magic",
      allowed_tags: "sensitive",
      limit: 10,
      page: undefined,
    });
    const cached = {
      pages: [{ ...feed, posts: [{ id: "cached-1" }] }],
      pageParams: [1],
    };
    queryClient.setQueryData(queryKey, cached);

    hydrateBootstrapViewCache(queryClient, response, params);

    expect(queryClient.getQueryData(queryKey)).toEqual(cached);
    expect(consumeBootstrapFeedPreview({
      feed: "home",
      by: "magic",
      allowed_tags: "sensitive",
      address: "MIRAGE1ABC",
    })).toEqual(feed);
  });

  test("does not cross-consume previews across lens identity", () => {
    const queryClient = new QueryClient();
    const params = {
      address: "MIRAGE1ABC",
      view: "feed:home" as const,
      by: "magic" as const,
      allowed_tags: "sensitive",
      limit: 10,
      lens_picks: "bitcoin:raw",
    };
    const queryKey = queryKeys.posts({
      address: "MIRAGE1ABC",
      feed: "home",
      by: "magic",
      allowed_tags: "sensitive",
      limit: 10,
      page: undefined,
      lens_picks: "bitcoin:raw",
    });
    queryClient.setQueryData(queryKey, {
      pages: [{ ...feed, posts: [{ id: "cached-1" }] }],
      pageParams: [1],
    });

    hydrateBootstrapViewCache(queryClient, response, params);

    expect(consumeBootstrapFeedPreview({
      feed: "home",
      by: "magic",
      allowed_tags: "sensitive",
      address: "MIRAGE1ABC",
    })).toBeNull();
    expect(consumeBootstrapFeedPreview({
      feed: "home",
      by: "magic",
      allowed_tags: "sensitive",
      address: "MIRAGE1ABC",
      lens_picks: "bitcoin:raw",
    })).toEqual(feed);
  });
});
