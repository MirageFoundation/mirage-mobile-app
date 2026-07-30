import { describe, expect, test } from "bun:test";

import { clearOptimisticVideoProcessingFromData } from "../src/api/cache/optimistic-video-processing.ts";
import { isPostVideoProcessing } from "../src/domain/posts/video-processing.ts";

describe("video processing state", () => {
  test("requires a video draft and a recent processing marker", () => {
    const now = 1_000_000;
    expect(isPostVideoProcessing({
      optimisticDraft: { attachmentType: "video" },
      optimisticVideoPreviewUntil: now + 45_000,
    }, now)).toBe(true);
    expect(isPostVideoProcessing({
      optimisticDraft: { attachmentType: "image" },
      optimisticVideoPreviewUntil: now + 45_000,
    }, now)).toBe(false);
    expect(isPostVideoProcessing({
      optimisticDraft: { attachmentType: "video" },
      optimisticVideoPreviewUntil: now - 16 * 60_000,
    }, now)).toBe(false);
  });

  test("clears API and UI markers throughout cached query shapes", () => {
    const data = {
      pages: [{
        posts: [{
          post_id: "target",
          optimistic_video_preview_until: 123,
        }],
      }],
      root: {
        id: "target",
        author: { id: "author" },
        optimisticVideoPreviewUntil: 123,
      },
    };
    const result = clearOptimisticVideoProcessingFromData(data, "target");
    expect(result.pages[0].posts[0].optimistic_video_preview_until).toBeUndefined();
    expect(result.root.optimisticVideoPreviewUntil).toBeUndefined();
  });

  test("preserves reference identity when the target is absent", () => {
    const data = { pages: [{ posts: [{ post_id: "other" }] }] };
    expect(clearOptimisticVideoProcessingFromData(data, "target")).toBe(data);
  });
});
