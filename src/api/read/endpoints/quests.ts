import { api } from "../../client";

export interface QuestReward {
  amount: number;
  type: "mirage";
}

export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  action_type: "comment" | "vote" | "post" | "follow" | "share";
  progress: number;
  target: number;
  completed: boolean;
  rewards: QuestReward[];
  min_content_length: number | null;
  quality_threshold: number | null;
  count_vote_changes: boolean;
  time_spacing_minutes: number | null;
  unique_target: boolean | null;
  unique_topics_min: number | null;
}

export interface DailyQuestsResponse {
 balance: number;
 daily_quests: DailyQuest[];
 debug: boolean;
 reward_multiplier: number;
 seconds_until_reset: number;
 suspended: boolean;
}

export interface PendingReward {
  quest_id: string;
  amount: number;
  type: string;
}

export interface PendingRewardsResponse {
  balance: number;
  claiming_available: boolean;
  pending_invite_codes: number;
  pending_rewards: PendingReward[];
  reward_multiplier: number;
  suspended: boolean;
  total_mirage: number;
  total_mirage_after_multiplier: number;
}

export interface GetDailyQuestsParams {
 address: string;
}

export async function getDailyQuests(
params: GetDailyQuestsParams
): Promise<DailyQuestsResponse> {
 return api.get<DailyQuestsResponse>("/rewards/daily", { owner: params.address });
}

export async function getPendingRewards(
  params: GetDailyQuestsParams
): Promise<PendingRewardsResponse> {
  return api.get<PendingRewardsResponse>("/rewards/pending", { owner: params.address });
}
