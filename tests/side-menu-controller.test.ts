// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  createSideMenuRouteDelegate,
  getFollowedTopicDestination,
  getFollowedUserDestination,
  SIDE_MENU_SECTIONS,
} from "../src/features/side-menu/side-menu-model";

describe("side-menu controller model", () => {
  test("maps the account navigation sections in display order", () => {
    expect(SIDE_MENU_SECTIONS.map((section) => [
      section.title,
      section.items.map((item) => item.action),
    ])).toEqual([
      ["Rewards & Plans", ["subscription", "invite", "referrals", "quests"]],
      ["Content", ["saved", "history"]],
      ["Social", ["following", "topics", "agents"]],
      ["App", ["settings", "help", "about"]],
    ]);
    expect(SIDE_MENU_SECTIONS[0].items[0].hideOnIos).toBe(true);
  });

  test("delegates static, account, and external destinations", () => {
    const calls = [];
    const delegate = createSideMenuRouteDelegate({
      navigation: {
        push: (destination) => calls.push(["push", destination]),
        replace: (destination) => calls.push(["replace", destination]),
      },
      user: { walletAddress: "wallet-1", username: "alice" },
      openExternal: (url) => calls.push(["external", url]),
    });

    for (const action of [
      "subscription",
      "invite",
      "referrals",
      "quests",
      "saved",
      "history",
      "following",
      "topics",
      "agents",
      "settings",
      "help",
      "about",
    ]) delegate(action);

    expect(calls).toEqual([
      ["push", "/subscription"],
      ["push", "/invite-and-earn"],
      ["push", "/referrals"],
      ["push", "/quests"],
      ["push", "/saved-posts"],
      ["push", "/history"],
      ["push", "/user-following/wallet-1"],
      ["push", "/topics"],
      ["push", "/agents"],
      ["push", "/settings"],
      ["external", "https://mirage.foundation/faq"],
      ["external", "https://mirage.foundation"],
    ]);
  });

  test("uses username fallback and ignores following without an identity", () => {
    const destinations = [];
    const navigation = {
      push: (destination) => destinations.push(destination),
      replace: () => {},
    };
    createSideMenuRouteDelegate({ navigation, user: { username: "alice" }, openExternal: () => {} })("following");
    createSideMenuRouteDelegate({ navigation, user: null, openExternal: () => {} })("following");
    expect(destinations).toEqual(["/user-following/alice"]);
  });

  test("builds followed user and topic destinations", () => {
    expect(getFollowedUserDestination("address-1")).toBe("/user/address-1");
    expect(getFollowedTopicDestination("news")).toBe("/topic/news");
  });
});
