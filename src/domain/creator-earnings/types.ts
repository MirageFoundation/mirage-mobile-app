export const CREATOR_EARNINGS_SORTS = ["claim_deadline_asc", "epoch_desc"] as const;
export type CreatorEarningsSort = (typeof CREATOR_EARNINGS_SORTS)[number];

export const CREATOR_EARNINGS_LIMIT_DEFAULT = 25;
export const CREATOR_EARNINGS_LIMIT_MIN = 1;
export const CREATOR_EARNINGS_LIMIT_MAX = 100;
export const CREATOR_EARNINGS_PAGE_LIMIT = 25;
export const CREATOR_EARNINGS_SETTLE_PAGE_LIMIT = 50;
export const CREATOR_EARNINGS_MAX_PAGES = 200;

export const CREATOR_CLAIM_CONFIRM_TIMEOUT_MS = 60_000;
export const CREATOR_CLAIM_SYNC_TIMEOUT_MS = 120_000;

export type CreatorEarningsTab = "claimable" | "history";

export type CreatorClaimPhase =
  | "idle"
  | "submitting"
  | "confirming"
  | "delivered_syncing"
  | "settled"
  | "confirming_timeout"
  | "delivered_syncing_timeout"
  | "aborted";

export type CreatorEarningTarget = {
  txhash: string;
  amount: string;
  upvote_units: number;
  direct_reply_units: number;
  title: string | null;
  excerpt: string | null;
  community: string | null;
  is_comment: boolean;
  deleted: boolean;
};

export type CreatorEarningItem = {
  epoch_id: number;
  earned: string;
  claimed: string;
  epoch_start_unix: number | null;
  epoch_end_unix: number | null;
  claim_deadline_unix: number | null;
  claimed_height: number | null;
  posts: CreatorEarningTarget[];
  posts_next_cursor: string | null;
  posts_has_more: boolean;
};

export type CreatorEarningsSchedule = {
  creator_epoch_seconds: number | null;
  origin_epoch: number | null;
  origin_unix: number | null;
  max_creator_claim_epochs: number | null;
};

export type CreatorEarningsResponse = CreatorEarningsSchedule & {
  items: CreatorEarningItem[];
  next_cursor: string | null;
  has_more: boolean;
};

export type CreatorEarningTargetsResponse = {
  items: CreatorEarningTarget[];
  next_cursor: string | null;
  has_more: boolean;
};

export type CreatorEarningsRequestInput = {
  creator?: string | null;
  claimable_only?: boolean | string;
  sort?: string | null;
  limit?: number | string | null;
  cursor?: string | null;
};

export type NormalizedCreatorEarningsRequest = {
  creator: string;
  claimable_only: boolean;
  sort: CreatorEarningsSort;
  limit: number;
  cursor: string | null;
};

export type CreatorEarningTargetsRequestInput = {
  creator?: string | null;
  epoch_id?: number | string | null;
  limit?: number | string | null;
  cursor?: string | null;
};

export type NormalizedCreatorEarningTargetsRequest = {
  creator: string;
  epoch_id: number;
  limit: number;
  cursor: string | null;
};
