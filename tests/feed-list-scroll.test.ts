// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { scrollFeedListToTop } from "../src/pages/home/feed-list-scroll";

describe("feed list scroll", () => {
  test("no-ops when the list ref is missing", async () => {
    await expect(scrollFeedListToTop(null)).resolves.toBeUndefined();
    await expect(scrollFeedListToTop(undefined)).resolves.toBeUndefined();
  });

  test("scrolls to the real top and swallows list errors", async () => {
    const calls: Array<{ offset: number; animated?: boolean }> = [];
    await scrollFeedListToTop({
      scrollToOffset: (params) => {
        calls.push(params);
        return Promise.resolve();
      },
    });
    await scrollFeedListToTop({
      scrollToOffset: () => Promise.reject(new Error("unmounted")),
    }, { animated: true });

    expect(calls).toEqual([{ offset: 0, animated: false }]);
  });

  test("home and topic feeds no longer pre-scroll before prepending new posts", async () => {
    const home = await Bun.file("src/pages/home/use-home-tabbed-feed-controller.ts").text();
    const community = await Bun.file("src/pages/community/community-feed-content.tsx").text();

    expect(home).toContain("await scrollFeedListToTop(activeListRef.current)");
    expect(home).not.toContain("offset: 1");
    expect(home).not.toContain("recordInteraction");
    expect(home).not.toContain("minDelay");
    expect(community).not.toContain("@shopify/flash-list");
  });
});
