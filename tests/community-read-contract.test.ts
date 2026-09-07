// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const getCalls: { path: string; params?: unknown }[] = [];

const emptyDetail = {
  community: "empty",
  curated: false,
  live_team_count: 0,
  deleted_team_count: 0,
  post_count: 0,
  legacy_archive_count: 0,
  viewer_joined: false,
  stored_mode: null,
  stored_team_id: null,
  effective_mode: 2,
  effective_team_id: null,
  default_team: null,
};

mock.module("../src/api/client", () => ({
  api: {
    get: async (path: string, params?: unknown) => {
      getCalls.push({ path, params });
      if (String(path).startsWith("/communities/")) {
        return {
          ...emptyDetail,
          community: decodeURIComponent(String(path).slice("/communities/".length)),
        };
      }
      if (path === "/communities") {
        return { items: [], next_cursor: null, has_more: false };
      }
      throw new Error(`unexpected path ${path}`);
    },
  },
  apiClient: {},
}));

const { getCommunities, getCommunity, selectCommunitySlugs } = await import(
  "../src/api/read/endpoints/communities"
);
const { normalizeCommunitySlug } = await import("../src/domain/communities");

describe("community read contract", () => {
  test("lists communities on GET /communities with canonical query params", async () => {
    getCalls.length = 0;
    await getCommunities({
      query: "  Bitcoin ",
      joined_by: "MIRAGE1VIEWER",
      cursor: "10:bitcoin",
      curated: true,
      limit: 25,
    });

    expect(getCalls).toEqual([
      {
        path: "/communities",
        params: {
          query: "bitcoin",
          joined_by: "MIRAGE1VIEWER",
          cursor: "10:bitcoin",
          curated: true,
          limit: 25,
        },
      },
    ]);
    expect(getCalls[0]?.path).not.toContain("get_topics");
    expect(getCalls[0]?.path).not.toContain("search_topics");
  });

  test("normalizes and encodes detail slugs and accepts empty valid communities", async () => {
    getCalls.length = 0;
    const result = await getCommunity({
      slug: "  Bitcoin ",
      viewer: " MIRAGE1VIEWER ",
    });

    expect(normalizeCommunitySlug("  Bitcoin ")).toBe("bitcoin");
    expect(getCalls).toEqual([
      {
        path: "/communities/bitcoin",
        params: { viewer: "mirage1viewer" },
      },
    ]);
    expect(result.community).toBe("bitcoin");
    expect(result.post_count).toBe(0);
    expect(result.live_team_count).toBe(0);
    expect(result.stored_mode).toBeNull();
    expect(result.viewer_joined).toBe(false);
  });

  test("encodes reserved slug characters and never requests retired topic endpoints", async () => {
    getCalls.length = 0;
    await getCommunity({ slug: "foo/bar" });

    expect(getCalls[0]?.path).toBe("/communities/foo%2Fbar");
    expect(getCalls.every((call) => !call.path.includes("topic"))).toBe(true);
  });

  test("selectCommunitySlugs reads item.community", () => {
    expect(
      selectCommunitySlugs({
        items: [
          {
            community: "bitcoin",
            curated: false,
            live_team_count: 0,
            post_count: 1,
            default_team: null,
          },
        ],
        next_cursor: null,
        has_more: false,
      }),
    ).toEqual(["bitcoin"]);
    expect(selectCommunitySlugs(null)).toEqual([]);
  });
});
