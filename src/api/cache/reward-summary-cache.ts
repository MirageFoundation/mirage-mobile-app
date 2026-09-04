import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";

export type QuestProgressAction =
  | "post"
  | "comment"
  | "vote"
  | "follow"
  | "unfollow"
  | "edit"
  | "delete";

const QUALIFYING_QUEST_PROGRESS_ACTIONS = new Set<QuestProgressAction>([
  "post",
  "comment",
  "vote",
  "follow",
]);

export function shouldInvalidateRewardSummaryForAction(
  action: QuestProgressAction,
): boolean {
  return QUALIFYING_QUEST_PROGRESS_ACTIONS.has(action);
}

export function invalidateRewardSummary(
  queryClient: QueryClient,
  address: string | null | undefined,
): Promise<void> {
  if (!address) return Promise.resolve();
  return queryClient.invalidateQueries({
    queryKey: queryKeys.rewardSummary(address),
    refetchType: "active",
  });
}

export function invalidateRewardSummaryForAction(
  queryClient: QueryClient,
  address: string | null | undefined,
  action: QuestProgressAction,
): Promise<void> {
  if (!shouldInvalidateRewardSummaryForAction(action)) {
    return Promise.resolve();
  }
  return invalidateRewardSummary(queryClient, address);
}
