// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { shouldPruneOptimisticComment } from "../src/stores/post-comment-optimistic-store";

function comment(id: string, content = "hello", authorId = "you") {
  return {
    id,
    author: { id: authorId, username: "you", avatarSeed: authorId },
    content,
    likes: 1,
    dislikes: 0,
    hasLiked: true,
    hasDisliked: false,
    createdAt: new Date(0),
    replyCount: 0,
  };
}

describe("optimistic comment prune", () => {
  test("keeps a confirmed stand-in that already uses the server id", () => {
    expect(
      shouldPruneOptimisticComment(comment("tx-1"), [comment("tx-1")]),
    ).toBe(false);
  });

  test("removes a leftover optimistic row once the server copy exists", () => {
    expect(
      shouldPruneOptimisticComment(comment("optimistic-1"), [comment("tx-1")]),
    ).toBe(true);
  });

  test("does not prune unrelated local comments", () => {
    expect(
      shouldPruneOptimisticComment(
        comment("optimistic-1", "mine"),
        [comment("tx-1", "theirs", "other")],
      ),
    ).toBe(false);
  });
});
