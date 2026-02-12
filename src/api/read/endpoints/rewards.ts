import { api } from "../../client";

export interface QuestReward {
  type: "mirage";
  amount: number;
  apply_multiplier: boolean;
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
  time_spacing_minutes: number | null;
  unique_target: boolean;
  unique_topics_min: number | null;
  quality_threshold: number | null;
  count_vote_changes: boolean;
}

export interface FlashQuest {
  id: string;
  title: string;
  description: string;
  action_type: string;
  progress: number;
  target: number;
  completed: boolean;
  starts_at: number;
  ends_at: number;
  seconds_remaining: number;
  rewards: QuestReward[];
}

export interface PendingRewardRow {
  id: number;
  type: "mirage";
  data: { amount: number; apply_multiplier: boolean };
  reason: string;
  created_at: number;
}

export interface RewardSummaryResponse {
  suspended: boolean;
  daily_quests: DailyQuest[];
  flash_quest: FlashQuest | null;
  pending_rewards: PendingRewardRow[];
  seconds_until_reset: number;
  reward_multiplier: number;
  total_mirage: number;
  total_mirage_after_multiplier: number;
  pending_invite_codes: number;
  claiming_available: boolean;
  debug: boolean;
  disabled?: boolean;
  suspension?: Record<string, unknown>;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  unlocked: boolean;
  unlocked_at: number | null;
  badge_icon: string;
  rewards: QuestReward[];
}

export interface AchievementsResponse {
  achievements: Achievement[];
}

export interface GetRewardSummaryParams {
  address: string;
}

export async function getRewardSummary(
  params: GetRewardSummaryParams
): Promise<RewardSummaryResponse> {
  return api.get<RewardSummaryResponse>("/rewards/summary", { owner: params.address });
}

export async function getAchievements(
  params: GetRewardSummaryParams
): Promise<AchievementsResponse> {
  return api.get<AchievementsResponse>("/rewards/achievements", { owner: params.address });
}
