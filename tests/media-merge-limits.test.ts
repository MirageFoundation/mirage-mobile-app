// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  assertMediaMergeBufferSizes,
  getMediaMergeDecision,
  getMediaMergeFallback,
  MAX_IN_MEMORY_MEDIA_MERGE_BYTES,
  MediaMergeSizeLimitError,
} from "../src/utils/media-merge-limits";

describe("in-memory media merge limits", () => {
  test("allows a combined size below the limit", () => {
    const decision = getMediaMergeDecision(8 * 1024 * 1024, 4 * 1024 * 1024);

    expect(decision).toMatchObject({
      allowed: true,
      reason: "allowed",
      combinedBytes: 12 * 1024 * 1024,
    });
  });

  test("allows a combined size exactly at the limit", () => {
    const decision = getMediaMergeDecision(
      MAX_IN_MEMORY_MEDIA_MERGE_BYTES - 1,
      1,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.combinedBytes).toBe(MAX_IN_MEMORY_MEDIA_MERGE_BYTES);
  });

  test("rejects a combined size over the limit", () => {
    const decision = getMediaMergeDecision(MAX_IN_MEMORY_MEDIA_MERGE_BYTES, 1);

    expect(decision).toMatchObject({
      allowed: false,
      reason: "combined-size-limit",
      combinedBytes: MAX_IN_MEMORY_MEDIA_MERGE_BYTES + 1,
    });
  });

  test.each([
    [undefined, 1],
    [1, undefined],
    [null, 1],
    [1, Number.NaN],
    [-1, 1],
  ])("rejects missing or unknown sizes (%p, %p)", (videoSize, audioSize) => {
    expect(getMediaMergeDecision(videoSize, audioSize)).toMatchObject({
      allowed: false,
      reason: "unknown-size",
      combinedBytes: null,
    });
  });

  test("rejects addition that would overflow a safe integer", () => {
    const decision = getMediaMergeDecision(Number.MAX_SAFE_INTEGER, 1);

    expect(decision).toMatchObject({
      allowed: false,
      reason: "size-overflow",
      combinedBytes: null,
    });
  });

  test("defensive buffer guard rejects direct callers over the limit", () => {
    expect(() =>
      assertMediaMergeBufferSizes(MAX_IN_MEMORY_MEDIA_MERGE_BYTES, 1),
    ).toThrow(MediaMergeSizeLimitError);
  });

  test("fallback preserves the downloaded video and explains omitted audio", () => {
    const fallback = getMediaMergeFallback(
      getMediaMergeDecision(MAX_IN_MEMORY_MEDIA_MERGE_BYTES, 1),
    );

    expect(fallback?.preserveVideo).toBe(true);
    expect(fallback?.message).toContain("video is ready");
    expect(fallback?.message).toContain("audio");
    expect(getMediaMergeFallback(getMediaMergeDecision(1, 1))).toBeNull();
  });
});
