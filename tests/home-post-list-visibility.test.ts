// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  getBoundedVisibleIndexRange,
  getVisibleLayoutIndices,
  mergeViewableTokens,
} from "../src/pages/home/home-post-list-visibility";

const token = (id: string, index: number, isViewable = true) => ({
  item: { id },
  index,
  isViewable,
  key: id,
});

describe("home post list visibility", () => {
  test("bounds recovery work independently of a long feed", () => {
    const range = getBoundedVisibleIndexRange({
      itemCount: 100_000,
      scrollOffset: 4_200_000,
      viewportHeight: 900,
      estimatedItemSize: 420,
      maxCandidates: 24,
    });

    expect(range).not.toBeNull();
    expect(range!.count).toBeLessThanOrEqual(24);
    expect(range!.start).toBeGreaterThan(9_990);

    let layoutCalls = 0;
    getVisibleLayoutIndices({
      range: range!,
      scrollOffset: 4_200_000,
      viewportHeight: 900,
      minimumVisibleRatio: 0.2,
      getLayout: (index) => {
        layoutCalls += 1;
        return { y: index * 420, height: 420 };
      },
    });
    expect(layoutCalls).toBe(range!.count);
  });

  test("applies changed viewability tokens and removes departed posts", () => {
    const previous = new Map([
      ["post-a", token("post-a", 10)],
      ["post-b", token("post-b", 11)],
    ]);
    const next = mergeViewableTokens(
      previous,
      [token("post-b", 11), token("post-c", 12)],
      [token("post-a", 10, false), token("post-c", 12)],
    );

    expect(Array.from(next.keys())).toEqual(["post-b", "post-c"]);
    expect(previous.has("post-a")).toBe(true);
  });

  test("deduplicates repeated viewability snapshots used for seen tracking", () => {
    const next = mergeViewableTokens(
      new Map(),
      [token("post-a", 1), token("post-a", 1), token("post-b", 2)],
    );

    expect(Array.from(next.keys())).toEqual(["post-a", "post-b"]);
    expect(next.size).toBe(2);
  });

  test("uses token anchors for mixed row heights and estimated fallback otherwise", () => {
    const anchored = getBoundedVisibleIndexRange({
      itemCount: 10_000,
      scrollOffset: 420_000,
      viewportHeight: 800,
      estimatedItemSize: 420,
      anchorIndices: [42, 43],
    });
    expect(anchored).toEqual({ start: 39, end: 46, count: 8 });

    const layouts = new Map([
      [39, { y: 7_600, height: 700 }],
      [40, { y: 8_300, height: 120 }],
      [41, { y: 8_420, height: 480 }],
      [42, { y: 8_900, height: 160 }],
      [43, { y: 8_960, height: 600 }],
    ]);
    expect(
      getVisibleLayoutIndices({
        range: anchored!,
        scrollOffset: 8_400,
        viewportHeight: 700,
        minimumVisibleRatio: 0.2,
        getLayout: (index) => layouts.get(index),
      }),
    ).toEqual([41, 42, 43]);

    const fallback = getBoundedVisibleIndexRange({
      itemCount: 100,
      scrollOffset: 4_200,
      viewportHeight: 840,
      estimatedItemSize: 420,
    });
    expect(fallback).toEqual({ start: 7, end: 14, count: 8 });
  });

  test("crosses to JS visibility work on viewability and scroll-end boundaries only", async () => {
    const source = await Bun.file("src/pages/home/home-post-list.tsx").text();

    expect(source).not.toContain("runOnJS");
    expect(source).not.toContain("useAnimatedScrollHandler");
    expect(source).toMatch(/const handleScrollEndDrag[\s\S]*recomputeViewableFromLayout/);
    expect(source).toContain("onMomentumScrollEnd={handleMomentumScrollEnd}");
    expect(source).toContain("changed?: ViewToken[]");
  });
});
