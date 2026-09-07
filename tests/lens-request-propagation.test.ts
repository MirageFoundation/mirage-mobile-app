// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const getCalls: { path: string; params?: Record<string, unknown> }[] = [];

mock.module("../src/api/client", () => ({
  api: {
    get: async (path: string, params?: Record<string, unknown>, options?: any) => {
      if (options?.paramsFactory) params = await options.paramsFactory();
      getCalls.push({ path, params });
      if (path === "/get_comments") {
        return {
          root: { post_id: params?.post_id, comments: 0, children: [] },
          children: [],
        };
      }
      return { posts: [], total: 0, page: 1, limit: 10, has_more: false };
    },
  },
  apiClient: {},
}));

mock.module("../src/services/wallet-service", () => ({
  walletService: {
    getWallet: async () => null,
  },
}));

const { getPosts, getComments, getUserPosts } = await import("../src/api/read/endpoints/posts");
const { search } = await import("../src/api/read/endpoints/search");
const { getBootstrap } = await import("../src/api/read/endpoints/bootstrap");
const { useLensPicksStore } = await import("../src/stores/lens-picks-store");
const { withSessionLensPicks } = await import("../src/api/read/request-params");

afterEach(() => {
  getCalls.length = 0;
  useLensPicksStore.getState().clearAll();
});

describe("lens request propagation", () => {
  test("omits default lens HTTP fields and does not reinterpret them", async () => {
    await getPosts({ community: "Bitcoin", limit: 10 });
    expect(getCalls[0]?.params).toEqual({ community: "bitcoin", limit: 10 });
    expect(getCalls[0]?.params).not.toHaveProperty("lens");
    expect(getCalls[0]?.params).not.toHaveProperty("lens_picks");
  });

  test("sends explicit non-default lens fields without downgrading team", async () => {
    await getPosts({
      community: "bitcoin",
      lens: "team",
      team_id: 3,
      scope: "current",
    });
    expect(getCalls[0]?.params).toMatchObject({
      community: "bitcoin",
      lens: "team",
      team_id: 3,
    });
    expect(getCalls[0]?.params).not.toHaveProperty("scope");
    await expect(getPosts({
      feed: "home",
      lens: "team",
      team_id: 3,
    })).rejects.toThrow("team lens requires team_id and community");
    await expect(getUserPosts({
      owner: "mirage1owner",
      lens: "team",
      team_id: 3,
    })).rejects.toThrow("team lens requires team_id and community");
    await expect(search({
      q: "bitcoin",
      lens: "team",
      team_id: 3,
    })).rejects.toThrow("team lens requires team_id and community");
  });

  test("merges session picks only when lens_picks is omitted", async () => {
    useLensPicksStore.getState().setPick({
      viewer: "anonymous",
      community: "bitcoin",
      lens: "raw",
    });
    const merged = withSessionLensPicks({ feed: "home" });
    expect(merged.lens_picks).toBe("bitcoin:raw");
    const explicit = withSessionLensPicks({ feed: "home", lens_picks: "" });
    expect(explicit.lens_picks).toBe("");
    await getPosts(merged);
    expect(getCalls[0]?.params?.lens_picks).toBe("bitcoin:raw");
  });

  test("keeps nested comment lens fields and omits empty picks", async () => {
    await getComments({
      post_id: "root",
      lens: "team",
      team_id: 3,
      scope: "current",
      lens_picks: "",
    });
    expect(getCalls[0]?.params).toMatchObject({
      post_id: "root",
      lens: "team",
      team_id: 3,
    });
    expect(getCalls[0]?.params).not.toHaveProperty("lens_picks");
  });

  test("bootstrap feed identity reserves normalized picks", async () => {
    await getBootstrap(withSessionLensPicks({
      view: "feed:home",
      by: "magic",
      lens_picks: "zeta:raw,alpha:default",
    }));
    expect(getCalls[0]?.path).toBe("/bootstrap");
    expect(getCalls[0]?.params?.lens_picks).toBe("alpha:default,zeta:raw");
  });
});
