// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  applyPostDetailCommentCountDelta,
  formatPostDetailCount,
  getFocusedContextState,
  getPostDetailAvailability,
} from "../src/pages/post/post-detail-controller";

describe("post detail controller mappings", () => {
  test("maps unavailable post and comment routes without hiding optimistic roots", () => {
    expect(
      getPostDetailAvailability({
        isPostNotFound: true,
        isFocusedCommentNotFound: false,
        isCommentRoute: true,
        shouldUseOptimisticRootFallback: false,
      }),
    ).toEqual({
      isUnavailable: true,
      useUnavailableBack: true,
      message: "Comment not found",
      description: "This comment may have been deleted by its author or is no longer available.",
    });

    expect(
      getPostDetailAvailability({
        isPostNotFound: true,
        isFocusedCommentNotFound: false,
        isCommentRoute: false,
        shouldUseOptimisticRootFallback: true,
      }).isUnavailable,
    ).toBe(false);
  });

  test("maps focused context availability and completion independently", () => {
    expect(
      getFocusedContextState({
        availableAncestorCount: 2,
        loadedAncestorCount: 1,
        hasBranchReplies: true,
        hasLoadedFocusedContext: true,
        isContextCheckFetched: true,
        contextDepth: 1,
      }),
    ).toEqual({ hasRecentContext: true, recentContextDone: false });

    expect(
      getFocusedContextState({
        availableAncestorCount: 2,
        loadedAncestorCount: 2,
        hasBranchReplies: false,
        hasLoadedFocusedContext: true,
        isContextCheckFetched: true,
        contextDepth: 1,
      }),
    ).toEqual({ hasRecentContext: true, recentContextDone: true });
  });

  test("applies comment deltas against local or fallback counts and clamps at zero", () => {
    expect(applyPostDetailCommentCountDelta({ comments: 5, likes: 4 }, -2, 10)).toEqual({
      comments: 3,
      likes: 4,
    });
    expect(applyPostDetailCommentCountDelta({}, -3, 2)).toEqual({ comments: 0 });
  });

  test("formats sticky summary counts", () => {
    expect(formatPostDetailCount(999)).toBe("999");
    expect(formatPostDetailCount(1_200)).toBe("1.2K");
    expect(formatPostDetailCount(2_500_000)).toBe("2.5M");
  });
});
