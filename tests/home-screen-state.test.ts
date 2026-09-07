// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  applyFollowUserOverrides,
  getHomeEntryState,
  getHomeFeedSyncContext,
  getHomeFeedTabIndex,
  getHomeFeedType,
  getHomeHeaderBorderColor,
  HOME_FEED_OPTIONS,
} from "../src/pages/home/home-screen-state";

describe("home screen state", () => {
  const guest = { isLoggedIn: false, isInitializing: false, isConfigError: false };

  test("does not treat unresolved guest configuration as closed browsing", () => {
    expect(getHomeEntryState({ ...guest, openBrowsingEnabled: undefined })).toBe("loading");
    expect(getHomeEntryState({ ...guest, openBrowsingEnabled: true })).toBe("feed");
    expect(getHomeEntryState({ ...guest, openBrowsingEnabled: false })).toBe("welcome");
  });

  test("waits for wallet initialization before selecting the guest welcome", () => {
    expect(getHomeEntryState({
      ...guest, isInitializing: true, openBrowsingEnabled: false,
    })).toBe("loading");
  });

  test("keeps authenticated feeds available during startup and config failure", () => {
    for (const openBrowsingEnabled of [undefined, false, true]) {
      expect(getHomeEntryState({
        ...guest, isLoggedIn: true, isInitializing: true,
        isConfigError: true, openBrowsingEnabled,
      })).toBe("feed");
    }
  });

  test("failed guest config is an error, not a welcome or permanent loader", () => {
    expect(getHomeEntryState({
      ...guest, isConfigError: true, openBrowsingEnabled: undefined,
    })).toBe("error");
  });

  test("retains authoritative cached browsing policy through background errors", () => {
    expect(getHomeEntryState({
      ...guest, isConfigError: true, openBrowsingEnabled: true,
    })).toBe("feed");
    expect(getHomeEntryState({
      ...guest, isConfigError: true, openBrowsingEnabled: false,
    })).toBe("welcome");
  });

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

  test("does not accent the header for retired agent reminders", () => {
    expect(getHomeHeaderBorderColor()).toBeUndefined();
  });
});
