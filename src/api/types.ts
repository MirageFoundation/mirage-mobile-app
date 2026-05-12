// ============================================
// Shared API Types
// ============================================

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
  topic?: string;
  address?: string;
  allowed_tags?: string;
  feed?: "home" | "following";
  by?: "magic" | "newest" | "top";
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
  user_level: number;
}

export interface TierInfo {
  period_fee: string;
  vote_weight: number;
  max_content_length: string;
  max_followed_users: string;
  max_followed_topics: string;
  max_blocked_users: string;
  max_blocked_posts: string;
  max_blocked_topics: string;
  max_enabled_agents: string;
  can_be_agent: boolean;
  can_remove_anon: boolean;
  can_have_biography: boolean;
  can_have_avatar: boolean;
  can_have_banner: boolean;
  can_have_flair: boolean;
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
  // Chain params (from get_chain_config)
  max_username_size: number;
  min_username_size: number;
  max_topic_size: number;
  min_topic_size: number;
  subscription_period: number;
  mint_interval: number;
  tiers: TierInfo[];

  // Difficulty snapshot
  pow_difficulty: number;
  pow_message_count: number;
  pow_calm_sequence: number;
  pow_last_change_height: number;
  current_height: number;
  block_time: number;

  // Validator info
  validator_account_address: string;
  validator_operator_address: string;
  validator_consensus_address: string;
  validator_moniker: string;

  // Misc
  giphy_api_key: string;

  // Awards
  award_configs?: AwardConfig[];
}

export type ChainConfigResponse = ConfigResponse;

export interface NodeConfigResponse {
  giphy_api_key: string;
  quest_payouts_enabled: boolean;
  quests_enabled: boolean;
  registration_enabled: boolean;
  registration_invite_code_required: boolean;
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
  user_level: number; // 0 = free, 1 = subscriber, 10 = agent
  subscription_expiry: number; // unix seconds or 0
  auto_renew: boolean;
  reserve_funds: number; // umirage
  profile_registered_at: number | null; // unix seconds
  recent_votes: RecentVote[];
  referral_precheck_enabled: boolean;
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
  enabled_agents: string[];
  followed_users: string[];
  followed_topics: string[];
  blocked_users: string[];
  blocked_posts: string[];
  blocked_topics: string[];
  balance: number;
}

export interface UserFollowedResponse {
  enabled_agents: string[];
  followed_topics: string[];
  followed_users: string[];
}

export interface UserBlockedResponse {
  blocked_posts: string[]; // txhashes
  blocked_users: string[]; // addresses
  blocked_topics?: string[]; // topic names
}

export interface PreferencesResponse {
  topics: { topic: string; weight: number }[];
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
  topic: string;
  root_topic: string;
  root_post_id: string;
  title: string;
  content: string;
  tag: string;
  edited_at: number; // 0 if never edited
  thumbnail: string;
  media?: string[];
  media_meta?: Array<{ w?: number; h?: number }>;
  points: number;
  comments: number;
  user_vote: number; // -1, 0, 1
  user_weight: number; // viewer's weighted contribution
  awards?: AwardBadge[];
  agent_edited?: boolean;
  agent_edits_meta?: Record<string, string>;
  optimistic_status?: "pending" | "success" | "error";
  optimistic_error?: string;
  optimistic_action_id?: string;
  optimistic_draft?: import("@/src/stores/draft-store").PostDraft;
  appendices?: { agent: string; agent_username?: string; text: string }[];
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
}

export interface RootPostIdResponse {
  root_post_id: string;
  comment_id: string;
}

export interface CommentContextResponse {
  context: Post[]; // Array of parent posts
  comment_id: string;
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
// Topics Types
// ============================================

export interface TopicInfo {
  topic: string;
  post_count?: number;
  count?: number;
  comment_count?: number;
  flags?: Record<string, boolean>;
  dominant_tag?: string;
  dominant_ratio?: number;
}

export interface TopicsResponse {
  topics: TopicInfo[];
}

export interface SearchTopicsResponse {
  topics: TopicInfo[];
}

// ============================================
// Search Types
// ============================================

export interface SearchResponse {
  query: string;
  search_type: string;
  topics: TopicInfo[];
  users: UserInfo[];
  posts: Post[];
  has_more_topics: boolean;
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
  | "follow_topic"
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
  topic: string;
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
  most_active_topics: string[];
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
// Referral
// ============================================

export interface ReferralNode {
  address: string;
  username?: string;
  children: ReferralNode[];
}

/** @deprecated Use ReferralSummaryResponse instead */
export interface ReferralStatsResponse {
  pending_total: number;
  paid_total: number;
  total_referrals: number;
  referral_tree: ReferralNode;
  referred_by?: string;
  last_update_ts: number;
  next_update_ts: number;
}

export interface ReferralPrecheckResponse {
  valid: boolean;
  available?: number;
  error?: string;
}

export interface ReferralPrecheckOptInResponse {
  ok: boolean;
  precheck_enabled: boolean;
  updated_at: number;
}

export interface ReferralSummaryItem {
  address: string;
  username: string;
  referred_at: number;
  posts: number;
  votes: number;
  total_actions: number;
}

export interface ReferralSummaryResponse {
  referrals: ReferralSummaryItem[];
  total: number;
  period_start: number;
  period_end: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

// ============================================
// Invite Code
// ============================================

export interface InviteCode {
  code: string;
  used_by: string | null;
  created_at: number;
  used_at: number | null;
  is_used: boolean;
}

export interface GetInviteCodesResponse {
  codes: InviteCode[];
  total: number;
  available: number;
}

export interface ValidateInviteCodeResponse {
  valid: boolean;
  code: string;
  error?: "invalid_code" | "already_used" | "expired";
  message?: string;
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
}

export type UploadUrlResponse = ImageUploadResponse | VideoUploadResponse;
