// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { readThreadAncestors } from "@/src/api/read/thread-ancestors";
import type { CommentsResponse, PostWithChildren } from "@/src/api/types";

function post(id: string, target = ""): PostWithChildren {
  return {
    post_id: id,
    target,
    children: [],
  } as unknown as PostWithChildren;
}

function response(
  root: PostWithChildren,
  ancestors?: PostWithChildren[],
  omitted?: number,
): CommentsResponse {
  return {
    root,
    children: [],
    ...(ancestors !== undefined ? { ancestors } : {}),
    ...(omitted !== undefined ? { ancestors_omitted: omitted } : {}),
  };
}

describe("readThreadAncestors", () => {
  test("reports unresolved for a seeded placeholder that has no ancestors", () => {
    // The inbox seeds an entry like this so a tapped reply paints instantly.
    // It must NOT be read as "this comment is the root post".
    const result = readThreadAncestors(response(post("c1", "p1")));
    expect(result.resolved).toBe(false);
    expect(result.rootPost).toBeNull();
    expect(result.rootPostId).toBeNull();
    expect(result.parentChain).toEqual([]);
    expect(result.isComment).toBe(false);
  });

  test("reports unresolved for missing or empty data", () => {
    expect(readThreadAncestors(undefined).resolved).toBe(false);
    expect(
      readThreadAncestors({ children: [] } as unknown as CommentsResponse).resolved,
    ).toBe(false);
  });

  test("treats an empty ancestor list as a root post", () => {
    const root = post("p1");
    const result = readThreadAncestors(response(root, []));
    expect(result.resolved).toBe(true);
    expect(result.isComment).toBe(false);
    expect(result.rootPost).toBe(root);
    expect(result.rootPostId).toBe("p1");
    expect(result.parentChain).toEqual([]);
    expect(result.omitted).toBe(0);
  });

  test("splits root post from the parent chain, preserving root-first order", () => {
    const rootPost = post("p1");
    const parent = post("c1", "p1");
    const nearestParent = post("c2", "c1");
    const result = readThreadAncestors(
      response(post("c3", "c2"), [rootPost, parent, nearestParent]),
    );

    expect(result.resolved).toBe(true);
    expect(result.isComment).toBe(true);
    expect(result.rootPost).toBe(rootPost);
    expect(result.rootPostId).toBe("p1");
    // Root post is excluded — it renders as the OP header, not as context.
    expect(result.parentChain.map((c) => c.post_id)).toEqual(["c1", "c2"]);
  });

  test("carries the elided ancestor count", () => {
    const result = readThreadAncestors(
      response(post("c9", "c8"), [post("p1"), post("c8", "c7")], 6),
    );
    expect(result.omitted).toBe(6);
  });

  test("normalizes a missing or negative omitted count to zero", () => {
    expect(
      readThreadAncestors(response(post("c2", "c1"), [post("p1"), post("c1", "p1")]))
        .omitted,
    ).toBe(0);
    expect(
      readThreadAncestors(
        response(post("c2", "c1"), [post("p1"), post("c1", "p1")], -3),
      ).omitted,
    ).toBe(0);
  });

  test("a direct reply to the OP yields an empty parent chain", () => {
    const rootPost = post("p1");
    const result = readThreadAncestors(response(post("c1", "p1"), [rootPost]));
    expect(result.resolved).toBe(true);
    expect(result.isComment).toBe(true);
    expect(result.rootPostId).toBe("p1");
    expect(result.parentChain).toEqual([]);
  });
});
