// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function readSource(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("profile list ownership", () => {
  test.each([
    "src/pages/profile/profile-content.tsx",
    "src/pages/user/user-profile-content.tsx",
  ])("%s owns one virtualized vertical list", (path) => {
    const source = readSource(path);

    expect(source.match(/<AnimatedFlatList\b/g)).toHaveLength(1);
    expect(source).toContain("data={");
    expect(source).toContain("onEndReached={");
    expect(source).toContain("viewabilityConfig={");
    expect(source).toContain("onViewableItemsChanged={");
    expect(source).not.toContain("scrollEnabled={false}");
    expect(source).not.toContain("nestedScrollEnabled");
  });

  test("legacy nested profile feed is not available", () => {
    const tabsSource = readSource("src/components/molecules/profile-tabs.tsx");

    expect(existsSync(join(root, "src/components/molecules/profile-posts-list.tsx"))).toBe(false);
    expect(tabsSource).not.toContain("ProfilePostsList");
    expect(tabsSource).not.toContain("PagerView");
  });
});
