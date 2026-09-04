// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  GALLERY_MEDIA_FALLBACK_ASPECT_RATIO,
  GALLERY_MEDIA_MAX_HEIGHT,
  computeGalleryFrameHeight,
  hasGalleryItemAspectRatio,
  resolveGalleryItemAspectRatio,
  resolveGallerySlideFrame,
} from "../src/components/molecules/media-gallery-sizing";

describe("media gallery sizing", () => {
  test("prefers explicit pixel dimensions over a default-looking ratio", () => {
    expect(resolveGalleryItemAspectRatio({
      width: 1600,
      height: 800,
      aspectRatio: 16 / 9,
    })).toBe(2);
  });

  test("uses a real aspect ratio when pixel size is missing", () => {
    expect(resolveGalleryItemAspectRatio({ aspectRatio: 4 / 3 })).toBe(4 / 3);
  });

  test("uses a stable tall fallback when the item has no size metadata", () => {
    expect(resolveGalleryItemAspectRatio({})).toBe(
      GALLERY_MEDIA_FALLBACK_ASPECT_RATIO,
    );
    expect(hasGalleryItemAspectRatio({})).toBe(false);
    expect(hasGalleryItemAspectRatio({ width: 1200, height: 800 })).toBe(true);
  });

  test("sizes landscape slides below the 450 cap used for tall media", () => {
    expect(computeGalleryFrameHeight(2, 360)).toBe(180);
    expect(computeGalleryFrameHeight(0.5, 360)).toBe(GALLERY_MEDIA_MAX_HEIGHT);
  });

  test("keeps mixed portrait and landscape slides on the same gallery width", () => {
    const galleryWidth = 360;
    const landscape = resolveGallerySlideFrame(16 / 9, galleryWidth);
    const portrait = resolveGallerySlideFrame(4 / 5, galleryWidth);
    expect(landscape.width).toBe(galleryWidth);
    expect(portrait.width).toBe(galleryWidth);
    expect(landscape.height).toBeLessThan(portrait.height);
    expect(portrait.height).toBeLessThanOrEqual(GALLERY_MEDIA_MAX_HEIGHT);
  });
});
