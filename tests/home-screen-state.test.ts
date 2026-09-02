// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  applyFollowUserOverrides,
  getHomeFeedSyncContext,
  getHomeFeedTabIndex,
  getHomeFeedType,
  getHomeHeaderBorderColor,
  HOME_FEED_OPTIONS,
} from "../src/pages/home/home-screen-state";

describe("home screen state", () => {
  test("maps header selections to tab and navigation context", () => {
    expect(HOME_FEED_OPTIONS).toEqual([
      { label: "Magic", value: "magic" },
      { label: "Latest", value: "latest" },
    ]);
    expect(getHomeFeedTabIndex("magic")).toBe(0);
    expect(getHomeFeedTabIndex("latest")).toBe(1);
    expect(getHomeFeedType(0)).toBe("magic");
    expect(getHomeFeedType(1)).toBe("latest");
    expect(getHomeFeedSyncContext(0)).toBe("home:magic");
    expect(getHomeFeedSyncContext(1)).toBe("home:latest");
  });

  test("applies optimistic follow and unfollow overrides without mutating input", () => {
    const followed = ["first", "second"];
    expect(applyFollowUserOverrides(followed, {
      first: false,
      third: true,
    })).toEqual(["second", "third"]);
    expect(followed).toEqual(["first", "second"]);
    expect(applyFollowUserOverrides(followed, {})).toEqual(followed);
  });

  test("maps reminder state to the header accent", () => {
    expect(getHomeHeaderBorderColor(true, "#ff0000")).toBe("#ff000040");
    expect(getHomeHeaderBorderColor(false, "#ff0000")).toBeUndefined();
  });
});
