// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  calculateAccountAgeDays,
  formatMirageBalance,
  getUserProfileAction,
  getUserProfilePostType,
  resolveOptimisticMembership,
  resolveUserProfileAddress,
  selectUserProfileListData,
} from "../src/pages/user/user-profile-state";

describe("user profile state", () => {
  test("maps profile tabs to server post types", () => {
    expect(getUserProfilePostType(0)).toBe("submissions");
    expect(getUserProfilePostType(1)).toBe("comments");
    expect(getUserProfilePostType(2)).toBe("comments");
  });

  test("resolves usernames but preserves address route ids", () => {
    expect(resolveUserProfileAddress(undefined, "mirage-resolved")).toBeNull();
    expect(resolveUserProfileAddress("alice", undefined)).toBeNull();
    expect(resolveUserProfileAddress("alice", "mirage-resolved")).toBe("mirage-resolved");
    expect(resolveUserProfileAddress("mirage-address", "mirage-other")).toBe("mirage-address");
  });

  test("prefers optimistic follow and block membership", () => {
    expect(resolveOptimisticMembership("mirage-a", ["mirage-a"], null)).toBe(true);
    expect(resolveOptimisticMembership("mirage-a", ["mirage-a"], false)).toBe(false);
    expect(resolveOptimisticMembership("mirage-a", [], true)).toBe(true);
    expect(resolveOptimisticMembership(null, ["mirage-a"], null)).toBe(false);
  });

  test("maps menu state to the available relationship action", () => {
    expect(getUserProfileAction(false, false)).toBe("follow");
    expect(getUserProfileAction(true, false)).toBe("unfollow");
    expect(getUserProfileAction(true, true)).toBe("unblock");
  });

  test("selects tab content while hiding blocked and about feeds", () => {
    const submissions = [{ id: "submission" }];
    const comments = [{ post_id: "comment" }];
    expect(selectUserProfileListData(0, false, submissions, comments)).toEqual([
      "header", "tabs", submissions[0],
    ]);
    expect(selectUserProfileListData(1, false, submissions, comments)).toEqual([
      "header", "tabs", comments[0],
    ]);
    expect(selectUserProfileListData(2, false, submissions, comments)).toEqual(["header", "tabs"]);
    expect(selectUserProfileListData(0, true, submissions, comments)).toEqual(["header", "tabs"]);
  });

  test("formats balances and deterministic account age", () => {
    expect(formatMirageBalance(2_999_999)).toBe(2);
    expect(calculateAccountAgeDays(null, 100)).toBe(0);
    expect(calculateAccountAgeDays(86_400, 259_200)).toBe(2);
  });
});
