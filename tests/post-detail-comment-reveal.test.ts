// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  decidePostedCommentReveal,
  findCommentTopLevelIndex,
  shouldScrollPostedCommentToEnd,
  transferCommentRevealId,
  type PostedCommentRevealNode,
} from "../src/pages/post/post-detail-comment-reveal";

function comment(
  id: string,
  replies: PostedCommentRevealNode[] = [],
): PostedCommentRevealNode {
  return { id, replies };
}

describe("posted comment reveal", () => {
  test("finds nested replies at the parent top-level index", () => {
    const comments = [
      comment("a"),
      comment("b", [comment("b-1"), comment("b-2")]),
    ];

    expect(findCommentTopLevelIndex(comments, "b-2")).toBe(1);
    expect(findCommentTopLevelIndex(comments, "missing")).toBe(-1);
  });

  test("waits until the optimistic row exists, then scrolls once", () => {
    const pending = { id: "new", createdAt: 1_000 };
    const comments = [comment("old")];

    expect(
      decidePostedCommentReveal({
        pending,
        comments,
        now: 1_100,
      }),
    ).toEqual({ type: "wait" });

    expect(
      decidePostedCommentReveal({
        pending,
        comments: [comment("old"), comment("new")],
        now: 1_200,
      }),
    ).toEqual({ type: "scroll", index: 1, commentId: "new" });
  });

  test("does not re-scroll after the same comment has already been revealed", () => {
    expect(
      decidePostedCommentReveal({
        pending: { id: "new", createdAt: 1_000 },
        comments: [comment("new")],
        alreadyScrolledId: "new",
      }),
    ).toEqual({ type: "idle" });
  });

  test("times out if the optimistic row never appears", () => {
    expect(
      decidePostedCommentReveal({
        pending: { id: "new", createdAt: 1_000 },
        comments: [comment("old")],
        now: 5_000,
      }),
    ).toEqual({ type: "timeout" });
  });

  test("transfers a pending reveal id across optimistic confirmation", () => {
    expect(transferCommentRevealId("optimistic-1", "optimistic-1", "tx-1")).toBe("tx-1");
    expect(transferCommentRevealId("other", "optimistic-1", "tx-1")).toBe("other");
    expect(transferCommentRevealId(null, "optimistic-1", "tx-1")).toBe(null);
  });

  test("uses end-scroll only for the last top-level row", () => {
    expect(shouldScrollPostedCommentToEnd(2, 3)).toBe(true);
    expect(shouldScrollPostedCommentToEnd(0, 3)).toBe(false);
    expect(shouldScrollPostedCommentToEnd(0, 0)).toBe(false);
  });

  test("waits until the surface is ready even if the row exists", () => {
    expect(
      decidePostedCommentReveal({
        pending: { id: "new", createdAt: 1_000 },
        comments: [comment("new")],
        ready: false,
        now: 1_200,
      }),
    ).toEqual({ type: "wait" });

    expect(
      decidePostedCommentReveal({
        pending: { id: "new", createdAt: 1_000 },
        comments: [comment("new")],
        ready: true,
        now: 1_200,
      }),
    ).toEqual({ type: "scroll", index: 0, commentId: "new" });
  });
});
