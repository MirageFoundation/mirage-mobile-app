// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  clampZoomScale,
  clampZoomTranslation,
  maxZoomTranslation,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  settleZoomTransform,
} from "../src/components/molecules/preview-zoom-math";

describe("preview zoom math", () => {
  test("clamps scale to 1–4 and treats non-finite values as 1x", () => {
    expect(clampZoomScale(0.25)).toBe(MIN_ZOOM_SCALE);
    expect(clampZoomScale(1)).toBe(1);
    expect(clampZoomScale(2.5)).toBe(2.5);
    expect(clampZoomScale(8)).toBe(MAX_ZOOM_SCALE);
    expect(clampZoomScale(Number.NaN)).toBe(MIN_ZOOM_SCALE);
    expect(clampZoomScale(Number.POSITIVE_INFINITY)).toBe(MIN_ZOOM_SCALE);
  });

  test("has no pan range at 1x or with missing dimensions", () => {
    expect(maxZoomTranslation(400, 1)).toBe(0);
    expect(maxZoomTranslation(0, 3)).toBe(0);
    expect(maxZoomTranslation(-10, 3)).toBe(0);
    expect(maxZoomTranslation(Number.NaN, 3)).toBe(0);
    expect(clampZoomTranslation(80, 400, 1)).toBe(0);
  });

  test("clamps both axes to extent*(scale-1)/2 at min and max zoom", () => {
    expect(maxZoomTranslation(400, 2)).toBe(200);
    expect(maxZoomTranslation(400, 4)).toBe(600);
    expect(clampZoomTranslation(999, 400, 2)).toBe(200);
    expect(clampZoomTranslation(-999, 400, 2)).toBe(-200);
    expect(clampZoomTranslation(80, 400, 2)).toBe(80);
    expect(clampZoomTranslation(Number.NaN, 400, 2)).toBe(0);
  });

  test("settles zoom-out translation back into the new scale's bounds", () => {
    const settled = settleZoomTransform(600, -600, 1.2, 400, 800);
    expect(settled.scale).toBe(1.2);
    expect(settled.x).toBeCloseTo(40);
    expect(settled.y).toBeCloseTo(-80);
  });

  test("re-clamps an orientation swap without leaving the viewport", () => {
    const portrait = settleZoomTransform(0, 500, 3, 400, 800);
    expect(portrait.y).toBe(500);
    const landscape = settleZoomTransform(portrait.x, portrait.y, portrait.scale, 800, 400);
    expect(landscape.x).toBe(0);
    expect(landscape.y).toBe(400);
  });
});
