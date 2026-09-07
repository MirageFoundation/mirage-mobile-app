// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";

mock.module("../src/services/analytics", () => ({
  trackEvent: (event, properties) => {
    analyticsCalls.push({ event, properties });
  },
}));

const analyticsCalls = [];

const {
  collectJoinedCommunityPages,
  matchesJoinSettlement,
  joinedListContains,
} = await import("../src/api/write/utils/community-membership-model");
const { waitForIndexedCondition } = await import("../src/api/write/utils/indexer-settlement");
const { applyCommunityMembershipSettledEffects } = await import(
  "../src/api/write/utils/community-settled-effects"
);
const {
  clearAllLensPicks,
  getEncodedLensPicks,
  useLensPicksStore,
} = await import("../src/stores/lens-picks-store");
const { queryKeys } = await import("../src/api/read/query-keys");

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

afterEach(() => {
  analyticsCalls.length = 0;
  clearAllLensPicks();
});

describe("community membership settlement flow", () => {
  test("pages joined_by until the slug is present and accepts default join resolved mode 1", async () => {
    const pages = [
      { items: [{ community: "ethereum" }], next_cursor: "1:ethereum", has_more: true },
      { items: [{ community: "bitcoin" }], next_cursor: null, has_more: false },
    ];
    const collected = await collectJoinedCommunityPages(async () => pages.shift());
    expect(joinedListContains(collected.items, "bitcoin")).toBe(true);
    const result = await waitForIndexedCondition({
      now: () => 0,
      sleep: async () => undefined,
      overallTimeoutMs: 1_000,
      read: async () => ({
        present: joinedListContains(collected.items, "bitcoin"),
        exhausted: collected.exhausted,
        detail: {
          viewer_joined: true,
          stored_mode: 1,
          stored_team_id: "4",
        },
      }),
      matches: (state) => matchesJoinSettlement(state, {
        community: "bitcoin",
        mode: 0,
        pinned_team_id: 0,
      }),
    });
    expect(result.status).toBe("settled");
  });

  test("timeout keeps delivery semantics and is not a failed write", async () => {
    const delivery = { tx_hash: "aa", code: 0, height: 1, raw_log: "" };
    const settlement = await waitForIndexedCondition({
      now: () => 0,
      sleep: async () => undefined,
      overallTimeoutMs: 0,
      read: async () => ({ present: false, exhausted: true, detail: null }),
      matches: () => false,
    });
    expect(delivery.code).toBe(0);
    expect(settlement.status).toBe("timeout");
  });
});

describe("settled side effects", () => {
  test("does not clear picks, track analytics, or invalidate before confirmed settlement", () => {
    const queryClient = new QueryClient();
    const communityKey = queryKeys.community("bitcoin", "mirage1owner");
    queryClient.setQueryData(communityKey, { ok: true });
    useLensPicksStore.getState().setPick({
      viewer: "mirage1owner",
      community: "bitcoin",
      lens: "raw",
    });
    applyCommunityMembershipSettledEffects(
      queryClient,
      {
        delivery: { tx_hash: "aa", code: 0, height: 1, raw_log: "" },
        settlement: { status: "timeout" },
        community: "bitcoin",
        mode: 2,
        pinned_team_id: 0,
        operation: "join",
      },
      "mirage1owner",
    );
    expect(queryClient.getQueryState(communityKey)?.isInvalidated).toBe(false);
    expect(analyticsCalls).toEqual([]);
    expect(getEncodedLensPicks("mirage1owner")).toBe("bitcoin:raw");
  });

  test("join settlement tracks community_joined, invalidates, and clears only the matching pick", () => {
    const queryClient = new QueryClient();
    const communityKey = queryKeys.community("bitcoin", "mirage1owner");
    queryClient.setQueryData(communityKey, { ok: true });
    useLensPicksStore.getState().setPick({
      viewer: "mirage1owner",
      community: "bitcoin",
      lens: "raw",
    });
    useLensPicksStore.getState().setPick({
      viewer: "mirage1owner",
      community: "ethereum",
      lens: "default",
    });
    useLensPicksStore.getState().setPick({
      viewer: "mirage1other",
      community: "bitcoin",
      lens: "raw",
    });
    applyCommunityMembershipSettledEffects(
      queryClient,
      {
        delivery: { tx_hash: "aa", code: 0, height: 1, raw_log: "" },
        settlement: { status: "settled" },
        community: "bitcoin",
        mode: 2,
        pinned_team_id: 0,
        operation: "join",
      },
      "mirage1owner",
    );
    expect(queryClient.getQueryState(communityKey)?.isInvalidated).toBe(true);
    expect(analyticsCalls).toEqual([
      { event: "community_joined", properties: { community: "bitcoin", mode: 2 } },
    ]);
    expect(getEncodedLensPicks("mirage1owner")).toBe("ethereum:default");
    expect(getEncodedLensPicks("mirage1other")).toBe("bitcoin:raw");
  });

  test("leave does not clear picks or emit join analytics", () => {
    useLensPicksStore.getState().setPick({
      viewer: "mirage1owner",
      community: "bitcoin",
      lens: "raw",
    });
    const queryClient = new QueryClient();
    applyCommunityMembershipSettledEffects(
      queryClient,
      {
        delivery: { tx_hash: "aa", code: 0, height: 1, raw_log: "" },
        settlement: { status: "settled" },
        community: "bitcoin",
        mode: 0,
        pinned_team_id: 0,
        operation: "leave",
      },
      "mirage1owner",
    );
    expect(getEncodedLensPicks("mirage1owner")).toBe("bitcoin:raw");
    expect(analyticsCalls).toEqual([]);
  });
});

describe("runtime migration guards", () => {
  test("no runtime caller posts legacy topic write endpoints", () => {
    const root = join(import.meta.dir, "../src");
    const files = walk(root);
    const banned = [
      "/core/follow_topic",
      "/core/unfollow_topic",
      "/core/block_topic",
      "/core/unblock_topic",
    ];
    const hits = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const path of banned) {
        if (text.includes(`"${path}"`) || text.includes(`'${path}'`)) {
          hits.push(`${file}:${path}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  test("side menu membership comes from useJoinedCommunities and renders joined communities as [slug]", () => {
    const controller = source("src/features/side-menu/use-side-menu-controller.ts");
    const components = source("src/features/side-menu/side-menu-components.tsx");
    expect(controller).toContain("useJoinedCommunities");
    expect(controller).toContain("selectCommunitySlugs(joinedData)");
    expect(controller).not.toContain("followedData?.joined_communities");
    expect(components).toContain("Joined Communities");
    expect(components).toContain("[{topic}]");
    expect(components).not.toContain("#{topic}");
  });

  test("hooks only apply cache/analytics/pick clearing after settled success", () => {
    const hook = source("src/api/write/hooks/use-community-membership.ts");
    const effects = source("src/api/write/utils/community-settled-effects.ts");
    expect(effects).toContain('if (result.settlement.status !== "settled") return;');
    expect(effects).toContain('trackEvent("community_joined"');
    expect(effects).toContain("clearLensPickOnJoinSuccess");
    expect(hook).toContain("applyCommunityMembershipSettledEffects");
    expect(hook).not.toContain("setQueryData");
    expect(hook).not.toContain("5000");
    const follow = source("src/api/write/hooks/use-follow.ts");
    expect(follow).not.toContain("joined_communities: toggleFollowedTopics");
    expect(follow).not.toContain("followTopic(");
    const handler = source("src/hooks/use-follow-handler.ts");
    expect(handler).toContain("useToggleCommunityMembership");
    expect(handler).toContain("handleToggleCommunityMembership");
    const blockHandler = source("src/hooks/use-block-handler.ts");
    expect(blockHandler).toContain("useBlockCommunity");
    expect(blockHandler).toContain("requestBlockCommunity");
    const blockedList = source("src/pages/settings/blocked-list-content.tsx");
    expect(blockedList).toContain("useUnblockCommunity");
    expect(blockedList).not.toContain("useUnblockTopic");
  });
});
