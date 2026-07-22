// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  calculateAccountAgeDays,
  formatMirageBalance,
  getOwnProfileActionRoute,
  getOwnProfileListItemKey,
  getOwnProfilePostType,
  selectOwnProfileListData,
} from "../src/pages/profile/profile-state";

describe("own profile state", () => {
  test("maps tabs to bounded user-post query types", () => {
    expect(getOwnProfilePostType(0)).toBe("submissions");
    expect(getOwnProfilePostType(1)).toBe("comments");
    expect(getOwnProfilePostType(2)).toBe("comments");
  });

  test("selects posts, comments, and the about-only section", () => {
    const submissions = [{ id: "post" }];
    const comments = [{ post_id: "comment" }];
    expect(selectOwnProfileListData(0, submissions, comments)).toEqual([
      "header", "tabs", submissions[0],
    ]);
    expect(selectOwnProfileListData(1, submissions, comments)).toEqual([
      "header", "tabs", comments[0],
    ]);
    expect(selectOwnProfileListData(2, submissions, comments)).toEqual(["header", "tabs"]);
  });

  test("maps profile list items to stable keys", () => {
    expect(getOwnProfileListItemKey("header")).toBe("header");
    expect(getOwnProfileListItemKey({ id: "post" })).toBe("post");
    expect(getOwnProfileListItemKey({ post_id: "comment" })).toBe("comment");
  });

  test("maps own-profile actions to canonical routes", () => {
    expect(getOwnProfileActionRoute("edit-username")).toBe("/change-username");
    expect(getOwnProfileActionRoute("settings")).toBe("/settings");
    expect(getOwnProfileActionRoute("blocked")).toBe("/blocked-list");
    expect(getOwnProfileActionRoute("followers", "mirage-user")).toBe(
      "/user-following/mirage-user",
    );
    expect(getOwnProfileActionRoute("followers")).toBeNull();
  });

  test("formats balances and deterministic account age", () => {
    expect(formatMirageBalance(2_999_999)).toBe(2);
    expect(calculateAccountAgeDays(null, 100)).toBe(0);
    expect(calculateAccountAgeDays(86_400, 259_200)).toBe(2);
  });
});
