export type LensMode = "effective" | "default" | "team" | "raw";

export type LensRequest = {
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
};

export type ServedLens = {
  requested: LensMode;
  effective_mode: 0 | 1 | 2;
  effective_team_id: number | null;
};

export type CommunityTeamSummary = {
  team_id: string;
  name: string;
  subscriber_count: string;
};

export type CommunitySummary = {
  community: string;
  curated: boolean;
  live_team_count: number;
  post_count: number;
  default_team: CommunityTeamSummary | null;
};

export type CommunityDetail = CommunitySummary & {
  deleted_team_count: number;
  legacy_archive_count: number;
  viewer_joined: boolean;
  stored_mode: 0 | 1 | 2 | null;
  stored_team_id: string | null;
  effective_mode: 0 | 1 | 2;
  effective_team_id: string | null;
};

export type CommunityPreference = {
  stored_mode: 0 | 1 | 2;
  stored_team_id: string | null;
  effective_mode: 0 | 1 | 2;
  effective_team_id: string | null;
};

export type DailyQuota = {
  epoch: number;
  used: number;
  limit: number;
  remaining: number;
  reset_at: number;
};

export type RenewalWarning = {
  expiry: number;
  next_attempt: number;
  last_attempt_epoch: number;
  warning_sent: boolean;
};

export type CommunitiesResponse = {
  items: CommunitySummary[];
  next_cursor: string | null;
  has_more: boolean;
};

/** Synthetic posts never came from the server; do not use this to infer live lens. */
export const UNSPECIFIED_SERVED_LENS: ServedLens = {
  requested: "effective",
  effective_mode: 0,
  effective_team_id: null,
};
