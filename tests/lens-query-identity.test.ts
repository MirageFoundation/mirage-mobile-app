// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { queryKeys } from "../src/api/read/query-keys";
import { ServerRequestCoordinator } from "../src/api/server-runtime";

new ServerRequestCoordinator("https://node.example");

describe("lens-aware query identity", () => {
  const viewer = "MIRAGE1VIEWER";

  test("omitted defaults equal explicit current/effective defaults", () => {
    expect(queryKeys.posts({ feed: "home", address: viewer })).toEqual(
      queryKeys.posts({
        feed: "home",
        address: viewer,
        lens: "effective",
        scope: "current",
        lens_picks: "",
      }),
    );
    expect(queryKeys.comments("post-1", viewer)).toEqual(
      queryKeys.comments("post-1", viewer, {
        lens: "effective",
        scope: "current",
        lens_picks: "",
      }),
    );
    expect(queryKeys.search("mirage", "posts", 20, "sensitive", viewer)).toEqual(
      queryKeys.search("mirage", "posts", 20, "sensitive", viewer, {
        offset: 0,
        lens: "effective",
        scope: "current",
        lens_picks: "",
      }),
    );
    expect(queryKeys.userPosts("owner", viewer)).toEqual(
      queryKeys.userPosts("owner", viewer, {
        lens: "effective",
        scope: "current",
        lens_picks: "",
      }),
    );
  });

  test("different viewer, community, lens, team, scope, and picks do not collide", () => {
    const base = queryKeys.posts({ feed: "home", address: viewer });
    expect(base).not.toEqual(queryKeys.posts({ feed: "home", address: "mirage1other" }));
    expect(base).not.toEqual(queryKeys.posts({
      feed: "home",
      address: viewer,
      community: "bitcoin",
    }));
    expect(base).not.toEqual(queryKeys.posts({
      feed: "home",
      address: viewer,
      lens: "raw",
    }));
    expect(queryKeys.posts({
      community: "bitcoin",
      address: viewer,
      lens: "team",
      team_id: 3,
    })).not.toEqual(queryKeys.posts({
      community: "bitcoin",
      address: viewer,
      lens: "team",
      team_id: 4,
    }));
    expect(base).not.toEqual(queryKeys.posts({
      feed: "home",
      address: viewer,
      scope: "legacy",
    }));
    expect(base).not.toEqual(queryKeys.posts({
      feed: "home",
      address: viewer,
      lens_picks: "bitcoin:raw",
    }));
  });

  test("pick ordering and casing produce the same picks key", () => {
    expect(queryKeys.posts({
      feed: "home",
      address: viewer,
      lens_picks: "B:raw,A:default",
    })).toEqual(queryKeys.posts({
      feed: "home",
      address: viewer,
      lens_picks: "a:default, b:RAW",
    }));
    expect(queryKeys.search("q", "posts", 20, undefined, viewer, {
      lens_picks: "Zeta:raw,alpha:team:2",
    })).toEqual(queryKeys.search("q", "posts", 20, undefined, viewer, {
      lens_picks: "alpha:team:2,zeta:raw",
    }));
  });

  test("keeps family prefixes stable while adding named lens identity", () => {
    const posts = queryKeys.posts({ feed: "home", address: viewer });
    expect(posts.slice(0, queryKeys.postsRoot().length)).toEqual(queryKeys.postsRoot());
    const comments = queryKeys.comments("post-1", viewer, { lens: "raw" });
    expect(comments.slice(0, queryKeys.commentsRoot().length)).toEqual(
      queryKeys.commentsRoot(),
    );
    const userPosts = queryKeys.userPosts("owner", viewer, { type: "comments" });
    expect(userPosts.slice(0, queryKeys.userPostsForOwner("owner").length)).toEqual(
      queryKeys.userPostsForOwner("owner"),
    );
  });
});
