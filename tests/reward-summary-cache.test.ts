// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../src/api/read/query-keys";
import {
  invalidateRewardSummary,
  invalidateRewardSummaryForAction,
  shouldInvalidateRewardSummaryForAction,
  type QuestProgressAction,
} from "../src/api/cache/reward-summary-cache";

const VIEWER = "mirage1viewer";
const OTHER = "mirage1other";
const summary = { daily_quests: [{ id: "daily-post", progress: 0, target: 1 }] };

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

function exportedFn(sourceText: string, fnName: string) {
  const start = sourceText.indexOf(`export function ${fnName}`);
  expect(start).toBeGreaterThan(-1);
  const next = sourceText.indexOf("export function", start + 1);
  return sourceText.slice(start, next === -1 ? sourceText.length : next);
}

describe("quest progress action policy", () => {
  test("qualifying writes can change daily_quests", () => {
    const qualifying: QuestProgressAction[] = ["post", "comment", "vote", "follow"];
    expect(qualifying.every(shouldInvalidateRewardSummaryForAction)).toBe(true);
  });

  test("non-qualifying writes do not refresh quest progress", () => {
    const nonQualifying: QuestProgressAction[] = ["unfollow", "edit", "delete"];
    expect(nonQualifying.some(shouldInvalidateRewardSummaryForAction)).toBe(false);
  });
});

describe("reward summary invalidation", () => {
  test("invalidates the canonical key for the given address", async () => {
    const queryClient = new QueryClient();
    const key = queryKeys.rewardSummary(VIEWER);
    queryClient.setQueryData(key, summary);

    await invalidateRewardSummary(queryClient, VIEWER);

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  test("normalizes mixed-case addresses onto the same query key", async () => {
    const queryClient = new QueryClient();
    const key = queryKeys.rewardSummary("MIRAGE1VIEWER");
    queryClient.setQueryData(key, summary);

    await invalidateRewardSummary(queryClient, "Mirage1Viewer");

    expect(key).toEqual(queryKeys.rewardSummary(VIEWER));
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  test("does not invalidate a different address", async () => {
    const queryClient = new QueryClient();
    const viewerKey = queryKeys.rewardSummary(VIEWER);
    const otherKey = queryKeys.rewardSummary(OTHER);
    queryClient.setQueryData(viewerKey, summary);
    queryClient.setQueryData(otherKey, summary);

    await invalidateRewardSummary(queryClient, VIEWER);

    expect(queryClient.getQueryState(viewerKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  test("no-ops without an address", async () => {
    const queryClient = new QueryClient();
    const key = queryKeys.rewardSummary(VIEWER);
    queryClient.setQueryData(key, summary);

    await invalidateRewardSummary(queryClient, undefined);
    await invalidateRewardSummary(queryClient, null);
    await invalidateRewardSummary(queryClient, "");

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  });

  test("refetches active observers only", async () => {
    const calls: unknown[] = [];
    const queryClient = {
      invalidateQueries: async (options: unknown) => {
        calls.push(options);
      },
    };

    await invalidateRewardSummary(queryClient as QueryClient, VIEWER);

    expect(calls).toEqual([
      {
        queryKey: queryKeys.rewardSummary(VIEWER),
        refetchType: "active",
      },
    ]);
  });

  test("qualifying actions invalidate and non-qualifying actions do not", async () => {
    const queryClient = new QueryClient();
    const key = queryKeys.rewardSummary(VIEWER);
    queryClient.setQueryData(key, summary);

    await invalidateRewardSummaryForAction(queryClient, VIEWER, "unfollow");
    await invalidateRewardSummaryForAction(queryClient, VIEWER, "edit");
    await invalidateRewardSummaryForAction(queryClient, VIEWER, "delete");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);

    await invalidateRewardSummaryForAction(queryClient, VIEWER, "vote");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  test("failed or address-less qualifying actions do not touch other keys", async () => {
    const queryClient = new QueryClient();
    const viewerKey = queryKeys.rewardSummary(VIEWER);
    const otherKey = queryKeys.rewardSummary(OTHER);
    queryClient.setQueryData(viewerKey, summary);
    queryClient.setQueryData(otherKey, summary);

    await invalidateRewardSummaryForAction(queryClient, undefined, "post");
    await invalidateRewardSummaryForAction(queryClient, OTHER, "delete");

    expect(queryClient.getQueryState(viewerKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });
});

describe("quest-progress success-path wiring", () => {
  test("create post and comment success invalidate; edit and delete do not", () => {
    const postSrc = source("src/api/write/hooks/use-post.ts");
    expect(exportedFn(postSrc, "usePost")).toContain(
      'invalidateRewardSummaryForAction(queryClient, address, "post")',
    );
    expect(exportedFn(postSrc, "useComment")).toContain(
      'invalidateRewardSummaryForAction(queryClient, address, "comment")',
    );
    expect(exportedFn(postSrc, "useEdit")).not.toContain("invalidateRewardSummary");
    expect(exportedFn(postSrc, "useDelete")).not.toContain("invalidateRewardSummary");
    expect(exportedFn(postSrc, "useComment")).toMatch(
      /onSuccess:[\s\S]*invalidateRewardSummaryForAction[\s\S]*onSettled:/,
    );
  });

  test("vote mutation success invalidates; button-press and optimistic start do not", () => {
    const voteSrc = source("src/api/write/hooks/use-vote.ts");
    const voteHandlerSrc = source("src/hooks/use-vote-handler.ts");
    expect(exportedFn(voteSrc, "useVote")).toContain(
      'invalidateRewardSummaryForAction(queryClient, address, "vote")',
    );
    expect(exportedFn(voteSrc, "useOptimisticVote")).not.toContain(
      "invalidateRewardSummary",
    );
    expect(voteHandlerSrc).not.toContain("reward-summary-cache");
    expect(voteHandlerSrc).not.toContain("invalidateRewardSummary");
  });

  test("follow success invalidates; unfollow success does not", () => {
    const followSrc = source("src/api/write/hooks/use-follow.ts");
    const followHandlerSrc = source("src/hooks/use-follow-handler.ts");
    expect(exportedFn(followSrc, "useFollowUser")).toContain(
      'invalidateRewardSummaryForAction(queryClient, address, "follow")',
    );
    expect(exportedFn(followSrc, "useFollowTopic")).toContain(
      'invalidateRewardSummaryForAction(queryClient, address, "follow")',
    );
    expect(exportedFn(followSrc, "useUnfollowUser")).not.toContain(
      "invalidateRewardSummary",
    );
    expect(exportedFn(followSrc, "useUnfollowTopic")).not.toContain(
      "invalidateRewardSummary",
    );
    expect(exportedFn(followSrc, "useToggleFollowUser")).toContain(
      'invalidateRewardSummaryForAction(queryClient, address, "follow")',
    );
    expect(exportedFn(followSrc, "useToggleFollowTopic")).toContain(
      'invalidateRewardSummaryForAction(queryClient, address, "follow")',
    );
    expect(exportedFn(followSrc, "useToggleFollowUser")).toMatch(
      /if \(!isCurrentlyFollowing\) \{[\s\S]*invalidateRewardSummaryForAction/,
    );
    expect(exportedFn(followSrc, "useToggleFollowTopic")).toMatch(
      /if \(!isCurrentlyFollowing\) \{[\s\S]*invalidateRewardSummaryForAction/,
    );
    expect(followHandlerSrc).not.toContain("reward-summary-cache");
  });
});
