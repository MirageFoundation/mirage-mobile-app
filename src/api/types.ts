// ============================================
// Shared API Types
// ============================================

import type {
  LensMode,
  ServedLens,
} from "@/src/domain/communities";

export type {
  CommunitiesResponse,
  CommunityDetail,
  CommunityPreference,
  CommunitySummary,
  CommunityTeamSummary,
  DailyQuota,
  LensMode,
  LensRequest,
  RenewalWarning,
  ServedLens,
} from "@/src/domain/communities";

// Pagination
export interface PaginatedResponse<T> {
  page: number;
  limit: number;
  has_more: boolean;
  total?: number;
  data?: T[];
}

// Common filters
export interface PostFilters {
  limit?: number;
  page?: number;
  community?: string;
  address?: string;
  allowed_tags?: string;
  feed?: "home" | "following";
  by?: "magic" | "newest" | "top";
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
}

export interface UserFilters {
  limit?: number;
  page?: number;
  has_username?: boolean;
}

// ============================================
// Parameters & Config
// ============================================

export interface ParametersResponse {
  last_block_hash: string; // hex
  pow_difficulty: number;
  pow_base_bits: number;
  pow_factor: number;
  balance?: number; // umirage, if address provided
}

export interface TierInfo {
  period_fee: string | number;
  vote_weight: number;
  max_title_length: string | number;
  max_content_length: string | number;
  max_followed_users: string | number;
  max_joined_communities: string | number;
  max_blocked_users: string | number;
  max_blocked_posts: string | number;
  max_blocked_communities: string | number;
  editing_time_mins: string | number;
  can_have_biography: boolean;
  can_have_avatar: boolean;
  can_have_banner: boolean;
  can_have_flair: boolean;
  max_biography_length: string | number;
  max_curation_memberships: string | number;
  max_daily_relays: string | number;
}

export interface AwardConfig {
  name: string;
  cost: number;
}

export interface AwardBadge {
  type: string;
  count: number;
}

export interface ConfigResponse {
  max_username_size: number;
  min_username_size: number;
  max_community_size: number;
  min_community_size: number;
  subscription_period: number;
  subscription_reserve_bps: number;
  mint_interval: number;
  mint_floor_split: number;
  mint_dynamic_split: number;
  block_time: number;
  tiers: TierInfo[];
  award_configs?: AwardConfig[];
}

export type ChainConfigResponse = ConfigResponse;

export interface NodeConfigResponse {
  giphy_api_key: string;
  open_browsing_enabled?: boolean;
  registration_enabled: boolean;
  uploads_disabled?: boolean;
  max_video_bytes?: number;
  max_video_size_mb?: number;
  max_video_duration_seconds?: number;
  validator_account_address: string;
  validator_consensus_address: string;
  validator_moniker: string;
  validator_operator_address: string;
  push_notifications_enabled?: boolean;
}

// ============================================
// User Types
// ============================================

export interface RecentVote {
  target: string; // txhash
  direction: number; // -1, 0, 1
  timestamp: number;
}

export interface UserStatusResponse {
  username: string | null;
  balance: number; // umirage
  user_level: number; // 0 = free, 1 = subscriber, >=100 = admin; other values are invalid/Unknown
  subscription_expiry: number; // unix seconds or 0
  auto_renew: boolean;
  reserve_funds: number; // umirage
  profile_registered_at: number | null; // unix seconds
  recent_votes: RecentVote[];
  effective_paid: boolean;
}

export interface ProfileResponse {
  owner: string;
  username: string | null;
  level: number;
  created_at: number;
  subscription_expiry: number;
  auto_renew: boolean;
  reserve_funds: number;
  biography: string;
  avatar: string;
  banner: string;
  flair: string;

  // Lists
  followed_users: string[];
  joined_communities: string[];
  blocked_users: string[];
  blocked_posts: string[];
  blocked_communities: string[];
  balance: number;
  effective_paid: boolean;
}

export interface UserFollowedResponse {
  followed_users: string[];
  joined_communities?: string[];
}

export interface UserBlockedResponse {
  blocked_posts: string[]; // txhashes
  blocked_users: string[]; // addresses
  blocked_communities?: string[];
}

export interface PreferencesResponse {
  communities: { community: string; weight: number }[];
  authors: { user: string; weight: number }[];
}

export interface SimilarUser {
  address: string;
  username: string;
  similarity: number;
  shared_dimensions: number;
}

export interface SimilarUsersResponse {
  similar_users: SimilarUser[];
}

export interface UserInfo {
  address: string;
  username: string;
  level?: number;
  user_is_new?: boolean;
}

export interface UsersResponse {
  users: UserInfo[];
  page: number;
  limit: number;
  has_more: boolean;
  total: number;
}

// ============================================
// Posts & Feed Types
// ============================================

export interface Post {
  post_id: string; // txhash lowercase
  user_id: string; // owner address
  username: string;
  user_level?: number;
  level?: number;
  author_level?: number;
  new_user?: boolean;
  author_is_new?: boolean;
  timestamp: number;
  community: string;
  root_community: string;
  root_post_id: string;
  title: string;
  content: string;
  tag: string;
  edited_at: number; // 0 if never edited
  thumbnail: string;
  media?: string[];
  media_meta?: {
    w?: number;
    h?: number;
    poster_url?: string;
    posterUrl?: string;
    download_url?: string;
    downloadUrl?: string;
  }[];
  points: number;
  comments: number;
  user_vote: number; // -1, 0, 1
  user_weight: number; // viewer's weighted contribution
  awards?: AwardBadge[];
  lens: ServedLens;
  thread_locked: boolean;
  protocol_version?: number;
  optimistic_status?: "pending" | "success" | "error";
  optimistic_error?: string;
  optimistic_action_id?: string;
  optimistic_draft?: import("@/src/stores/draft-store").PostDraft;
  optimistic_video_preview_until?: number;
  optimistic_cached_until?: number;
}

export interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface PostWithChildren extends Post {
  children: PostWithChildren[];
}

export interface CommentsResponse {
  root: PostWithChildren;
  children: PostWithChildren[];
  /**
   * Ancestor chain for `root`, ordered ROOT POST FIRST and ending at the
   * immediate parent. `[]` when `root` is itself a root post.
   *
   * `undefined` is reserved for the synthetic inbox placeholder written before
   * the network response arrives. Real server responses must include this key,
   * matching the web client's hard requirement.
   */
  ancestors?: PostWithChildren[];
  /** Visible ancestors elided between the root post and the nearest few. */
  ancestors_omitted?: number;
}

// ============================================
// Inbox Types
// ============================================

export interface InboxReply {
  reply_id: string;
  reply_owner: string;
  reply_username: string;
  reply_content: string;
  reply_timestamp: number;
  reply_author_level: number;
  parent_id: string;
  parent_content: string;
  parent_owner: string;
  root_post_id: string;
  type?: "reply" | "mention" | "award" | "donation" | "follow" | "subscription_gift";
  award_type?: string;
  amount?: number;
}

export interface InboxResponse {
  replies: InboxReply[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ============================================
// Search Types
// ============================================

export interface SearchCommunityInfo {
  community: string;
  post_count?: number;
  dominant_tag?: string | null;
  dominant_ratio?: number;
}

export interface SearchResponse {
  query: string;
  search_type: string;
  communities: SearchCommunityInfo[];
  users: UserInfo[];
  posts: Post[];
  has_more_communities: boolean;
  has_more_users: boolean;
  has_more_posts: boolean;
}

// ============================================
// Username/Address Resolution
// ============================================

export interface AddressFromUsernameResponse {
  exists: boolean;
  address: string | null;
  username: string;
}

export interface UsernameFromAddressResponse {
  username: string | null;
  address: string;
}

// ============================================
// Transaction Status
// ============================================

export type TxType =
  | "vote"
  | "post"
  | "profile"
  | "follow_user"
  | "unknown";

export interface VoteDetails {
  owner: string;
  target: string;
  user_vote: number;
  user_weight: number;
  target_points: number;
}

export interface PostDetails {
  post_id: string;
  community: string;
  title: string;
}

export interface TxStatusResponse {
  found: boolean;
  tx_hash?: string;
  height?: number;
  code?: number; // 0 = success
  success?: boolean;
  indexed?: boolean; // Indexer processed
  tx_type?: TxType;
  details?: VoteDetails | PostDetails | Record<string, unknown>;
  error_details?: string; // When code != 0
}

// ============================================
// Stats & Network
// ============================================

export interface WelcomeStatsResponse {
  registered_users: number;
  posts_24h: number;
  active_7d: number;
  active_24h?: number;
}

export interface DifficultyHistory {
  height: number;
  difficulty: number;
  msg_count: number;
  timestamp: number;
}

export interface NetworkStatsResponse {
  server_balance: number;
  block_time: number;
  pow_difficulty: number;
  pow_message_count: number;
  pow_calm_sequence: number;
  pow_last_change_height: number;
  current_height: number;
  difficulty_history: DifficultyHistory[];
}

export interface TopAccount {
  address: string;
  username: string;
  balance: number;
}

export interface CirculationStatsResponse {
  total_supply: number;
  top_accounts: TopAccount[];
}

export interface AppStatsResponse {
  registered_users: number;
  unregistered_users: number;
  total_users: number;
  total_posts: number;
  total_comments: number;
  total_votes: number;
  paid_posts: number;
  free_posts: number;
  mirage_funded_ratio: number;
  upvotes: number;
  downvotes: number;
  edit_frequency: number;
  delete_rate: number;
  subscribers: number;
  new_registrations_7d: number;
  average_posts_per_user: number;
  average_votes_per_user: number;
  average_comments_per_post: number;
  most_active_communities: string[];
  tag_counts: Record<string, number>;
  dau_today: number;
  dau_yesterday: number;
  dau_registered_today: number;
  maus: number;
  dau_any_today: number;
  browser_breakdown: Record<string, number>;
  os_breakdown: Record<string, number>;
  device_breakdown: Record<string, number>;
}

// ============================================
// Leaderboard
// ============================================

export interface LeaderboardEntry {
  rank: number;
  address: string;
  username: string;
  post_count: number;
  comment_count: number;
  votes_cast: number;
  points_received: number;
  deleted_post_count: number;
  deleted_comment_count: number;
  score: number;
}

export interface LeaderboardResponse {
  since_ts: number;
  days: number;
  limit: number;
  page: number;
  total: number;
  leaderboard: LeaderboardEntry[];
}

// ============================================
// Peers
// ============================================

export interface PeerInfo {
  ip: string;
  moniker: string;
}

export interface PeersResponse {
  peers: PeerInfo[];
}

// ============================================
// Media Upload
// ============================================

export interface ImageUploadResponse {
  uploadURL: string;
  id: string;
  accountHash: string;
}

export interface VideoUploadResponse {
  uploadURL: string;
  provider: "stream";
  streamCustomer: string;
  // API may return snake_case
  stream_customer?: string;
  uid: string;
  url?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  download_url?: string;
  downloadUrl?: string;
  poster_url?: string;
  posterUrl?: string;
}

export type UploadUrlResponse = ImageUploadResponse | VideoUploadResponse;
