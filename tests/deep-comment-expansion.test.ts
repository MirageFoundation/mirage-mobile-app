// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  DeepCommentExpansionError,
  classifyDeepCommentExpansionFailure,
  fetchCompleteCommentTree,
  type CommentTreeFetcher,
} from "../src/api/read/deep-comment-expansion";
import type {
  CommentsResponse,
  PostWithChildren,
} from "../src/api/types";

function comment(
  postId: string,
  comments: number,
  children: PostWithChildren[] = [],
): PostWithChildren {
  return { post_id: postId, comments, children } as PostWithChildren;
}

function response(children: PostWithChildren[]): CommentsResponse {
  return { root: comment("root", children.length, children), children };
}

describe("deep comment expansion", () => {
  test("returns the complete tree when every required subtree succeeds", async () => {
    const fetcher: CommentTreeFetcher = async ({ post_id }) => {
      if (post_id === "root") return response([comment("child", 1)]);
      if (post_id === "child") return response([comment("leaf", 0)]);
      throw new Error("unexpected request");
    };

    const result = await fetchCompleteCommentTree(
      { post_id: "root" },
      fetcher,
    );

    expect(result.children[0]?.children[0]?.post_id).toBe("leaf");
  });

  test("rejects instead of returning a partial success when a child fails", async () => {
    const partial = response([comment("child", 1)]);
    const fetcher: CommentTreeFetcher = async ({ post_id }) => {
      if (post_id === "root") return partial;
      throw { response: { status: 404 }, data: { content: "private" } };
    };

    const promise = fetchCompleteCommentTree({ post_id: "root" }, fetcher);

    await expect(promise).rejects.toMatchObject({
      name: "DeepCommentExpansionError",
      code: "DEEP_COMMENT_EXPANSION_FAILED",
      classification: "not_found",
      status: 404,
    });
    expect(partial.children[0]?.children).toEqual([]);
  });

  test("rejects the overall result when a nested expansion fails", async () => {
    const fetcher: CommentTreeFetcher = async ({ post_id }) => {
      if (post_id === "root") return response([comment("child", 1)]);
      if (post_id === "child") return response([comment("nested", 1)]);
      throw { code: "ERR_NETWORK", message: "sensitive upstream detail" };
    };

    const promise = fetchCompleteCommentTree({ post_id: "root" }, fetcher);

    await expect(promise).rejects.toEqual(
      new DeepCommentExpansionError("network"),
    );
  });

  test("preserves abort errors instead of wrapping them", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetcher: CommentTreeFetcher = async ({ post_id }, signal) => {
      if (post_id === "root") {
        controller.abort();
        return response([comment("child", 1)]);
      }
      expect(signal).toBe(controller.signal);
      throw abortError;
    };

    const promise = fetchCompleteCommentTree(
      { post_id: "root" },
      fetcher,
      controller.signal,
    );

    await expect(promise).rejects.toBe(abortError);
  });

  test("classifies equivalent failures deterministically without exposing data", () => {
    const failures = [
      [{ response: { status: 404 } }, "not_found"],
      [{ response: { status: 503 } }, "server"],
      [{ response: { status: 401 } }, "http"],
      [{ code: "ECONNABORTED" }, "network"],
      [{ message: "Network Error" }, "network"],
      [{ privateCommentId: "secret" }, "unknown"],
    ] as const;

    for (const [failure, expected] of failures) {
      expect(classifyDeepCommentExpansionFailure(failure)).toBe(expected);
    }
    const error = new DeepCommentExpansionError("unknown");
    expect(error.message).not.toContain("secret");
    expect(error).not.toHaveProperty("cause");
  });
});
