# Read API Plan - GET Endpoints & TanStack Query

> **Implementation Order: 1 of 3** (Read → Onboarding → Write)
>
> This layer is implemented first. Most endpoints work without a wallet address.
> Hooks should accept an optional `address?: string` parameter for personalized data.

## TanStack Query Setup

### Persistence Configuration

Update `src/providers/query-provider.tsx`:

```typescript
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { storage } from "@/stores/mmkv-storage";

// MMKV adapter for TanStack Query (sync because MMKV is synchronous)
const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const persister = createSyncStoragePersister({
  storage: mmkvStorage,
  key: "mirage-query-cache",
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
```

### Cache Strategy by Endpoint Type

| Type          | staleTime | gcTime | Refetch         |
| ------------- | --------- | ------ | --------------- |
| Config/Params | 5 min     | 24 hrs | On app focus    |
| User Status   | 30 sec    | 1 hr   | After mutations |
| Feed/Posts    | 1 min     | 4 hrs  | Pull-to-refresh |
| Comments      | 30 sec    | 1 hr   | On navigate     |
| Static Lists  | 10 min    | 24 hrs | Manual          |

---

## Address Requirements by Endpoint

Most endpoints work without authentication. The `address` parameter enables personalized data.

### No Address Needed (Public)

| Endpoint                         | Notes                                                 |
| -------------------------------- | ----------------------------------------------------- |
| `GET /get_config`                | Chain params, tier info                               |
| `GET /get_parameters`            | Block hash, difficulty (address optional for balance) |
| `GET /get_posts`                 | Public feed works, no `user_vote` data                |
| `GET /p/[id]`                    | Post detail + comments, no `user_vote` data           |
| `GET /get_topics`                | All topics                                            |
| `GET /search`                    | Works, no blocked filtering                           |
| `GET /search_topics`             | Topic search                                          |
| `GET /get_users`                 | User list                                             |
| `GET /get_address_from_username` | Username resolution                                   |
| `GET /get_username_from_address` | Address resolution                                    |
| `GET /get_network_stats`         | Network info                                          |
| `GET /get_circulation_stats`     | Supply info                                           |
| `GET /get_tx_status`             | Transaction status                                    |
| `GET /leaderboard`               | Leaderboard                                           |
| `GET /get_peers`                 | Peer list                                             |
| `GET /get_stats`                 | App statistics                                        |

### Address Required (Personalized)

| Endpoint                 | What address enables                 |
| ------------------------ | ------------------------------------ |
| `GET /get_user_status`   | User's tier, balance, subscription   |
| `GET /u/[id\|username]`  | Full profile with follow/block lists |
| `GET /get_inbox`         | User's reply notifications           |
| `GET /get_user_followed` | Who user follows                     |
| `GET /get_user_blocked`  | User's block list                    |
| `GET /get_preferences`   | Personalized weights                 |
| `GET /get_similar_users` | Similar user recommendations         |
| `GET /get_user_posts`    | User's own posts (owner param)       |
| `GET /referral/stats`    | Referral earnings                    |

### Address Optional (Enhanced)

| Endpoint              | Without address        | With address                     |
| --------------------- | ---------------------- | -------------------------------- |
| `GET /get_posts`      | Public feed            | + `user_vote`, blocked filtering |
| `GET /p/[id]`         | Post + comment tree    | + `user_vote`, blocked filtering |
| `GET /search`         | Search results         | + blocked content filtering      |
| `GET /get_parameters` | Block hash, difficulty | + balance                        |

---

## Directory Structure

```
src/api/read/
├── index.ts                 # Re-exports all hooks
├── hooks/
│   ├── index.ts
│   ├── use-parameters.ts
│   ├── use-config.ts
│   ├── use-user-status.ts
│   ├── use-profile.ts
│   ├── use-posts.ts
│   ├── use-user-posts.ts
│   ├── use-post-detail.ts
│   ├── use-inbox.ts
│   ├── use-topics.ts
│   ├── use-search.ts
│   ├── use-user-followed.ts
│   ├── use-user-blocked.ts
│   ├── use-tx-status.ts
│   ├── use-network-stats.ts
│   └── use-leaderboard.ts
│
└── endpoints/
    ├── index.ts
    ├── parameters.ts
    ├── config.ts
    ├── users.ts
    ├── posts.ts
    ├── comments.ts
    ├── topics.ts
    ├── search.ts
    ├── social.ts
    ├── stats.ts
    └── types.ts
```

---

## Query Keys Convention

```typescript
// src/api/read/query-keys.ts

export const queryKeys = {
  // Config & Parameters
  parameters: (address?: string) => ["parameters", address] as const,
  config: (address?: string) => ["config", address] as const,

  // User
  userStatus: (address: string) => ["user", "status", address] as const,
  profile: (address: string) => ["user", "profile", address] as const,
  userPosts: (owner: string, type?: string) =>
    ["user", "posts", owner, type] as const,
  userFollowed: (address: string) => ["user", "followed", address] as const,
  userBlocked: (address: string) => ["user", "blocked", address] as const,
  preferences: (address: string) => ["user", "preferences", address] as const,
  similarUsers: (address: string) => ["user", "similar", address] as const,

  // Posts & Feed
  posts: (filters: PostFilters) => ["posts", filters] as const,
  postDetail: (id: string, address?: string, depth?: number) =>
    ["postDetail", id, address, depth] as const,

  // Inbox
  inbox: (address: string, page?: number) => ["inbox", address, page] as const,

  // Topics
  topics: (limit?: number) => ["topics", limit] as const,
  searchTopics: (query: string) => ["topics", "search", query] as const,

  // Search
  search: (query: string, type?: string) => ["search", query, type] as const,

  // Username/Address Resolution
  addressFromUsername: (username: string) =>
    ["resolve", "address", username] as const,
  usernameFromAddress: (address: string) =>
    ["resolve", "username", address] as const,
  users: (filters?: UserFilters) => ["users", filters] as const,

  // Transaction
  txStatus: (hash: string) => ["tx", hash] as const,

  // Stats
  networkStats: () => ["stats", "network"] as const,
  circulationStats: () => ["stats", "circulation"] as const,
  appStats: () => ["stats", "app"] as const,
  leaderboard: (days?: number) => ["leaderboard", days] as const,

  // Referral
  referralStats: (address: string) => ["referral", address] as const,

  // Peers
  peers: () => ["peers"] as const,
} as const;
```

---

## Endpoint Definitions

### 1. Parameters & Config

#### `GET /get_parameters`

**Purpose**: Get latest block hash and PoW difficulty for signing

```typescript
// src/api/read/endpoints/parameters.ts

interface GetParametersParams {
  address?: string; // Optional: also returns balance
}

interface ParametersResponse {
  last_block_hash: string; // hex
  pow_difficulty: number;
  balance?: number; // umirage, if address provided
}

// Hook: useParameters
// Refetch: Before every write operation
// staleTime: 0 (always fresh for signing)
```

#### `GET /get_config`

**Purpose**: Chain parameters, tier info, validator info

```typescript
interface ConfigResponse {
  // Chain params
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
}

// Hook: useConfig
// staleTime: 5 minutes (safe to cache)
```

---

### 2. User Endpoints

#### `GET /get_user_status`

**Purpose**: User tier, balance, subscription, recent votes

```typescript
interface GetUserStatusParams {
  address: string; // Required
}

interface UserStatusResponse {
  username: string | null;
  balance: number; // umirage
  user_level: number; // 0 = free, 1-3 = paid
  subscription_expiry: number; // unix seconds or 0
  auto_renew: boolean;
  reserve_funds: number; // umirage
  profile_registered_at: number | null; // unix seconds
  recent_votes: RecentVote[];
}

interface RecentVote {
  target: string; // txhash
  direction: number; // -1, 0, 1
  timestamp: number;
}

// Hook: useUserStatus
// staleTime: 30 seconds
// Invalidate: After any write mutation
```

#### `GET /u/[id|username]`

**Purpose**: Full profile with all lists. Accepts username or `mirage1...` address as the `id` parameter.

**Replaces**: `GET /profile?address=...`

```typescript
interface GetProfileParams {
  id: string; // username OR mirage1... address
}

interface ProfileResponse {
  owner: string;
  username: string | null;
  level: number;
  created_at: number;
  subscription_expiry: number;
  auto_renew: boolean;
  reserve_funds: number;
  is_moderator: boolean;
  biography: string;
  avatar: string;
  banner: string;

  // Lists
  followed_users: string[];
  followed_topics: string[];
  followed_moderators: string[];
  blocked_users: string[];
  blocked_posts: string[];
  quality_posts: string[];
}

// Hook: useProfile
// staleTime: 1 minute
```

#### `GET /get_user_followed`

```typescript
interface UserFollowedResponse {
  followed_moderators: string[];
  followed_topics: string[];
  followed_users: string[];
}

// Hook: useUserFollowed
```

#### `GET /get_user_blocked`

```typescript
interface UserBlockedResponse {
  blocked_posts: string[]; // txhashes
  blocked_users: string[]; // addresses
}

// Hook: useUserBlocked
```

#### `GET /get_preferences`

```typescript
interface PreferencesResponse {
  topics: { topic: string; weight: number }[];
  authors: { user: string; weight: number }[];
}

// Hook: usePreferences
```

#### `GET /get_similar_users`

```typescript
interface SimilarUsersResponse {
  similar_users: {
    address: string;
    username: string;
    similarity: number;
    shared_dimensions: number;
  }[];
}

// Hook: useSimilarUsers
```

---

### 3. Posts & Feed Endpoints

#### `GET /get_posts`

**Purpose**: Main feed endpoint

```typescript
interface GetPostsParams {
  limit?: number; // max 100
  page?: number;
  topic?: string; // topic name or 'all'
  address?: string; // viewer address for filtering/votes
  allowed_tags?: string; // comma-separated, default 'sensitive'
  feed?: "home" | "following";
  by?: "magic" | "new" | "top"; // sort mode
}

interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  latest_inbox_timestamp?: number;
}

interface Post {
  post_id: string; // txhash lowercase
  user_id: string; // owner address
  username: string;
  timestamp: number;
  topic: string;
  root_topic: string;
  root_post_id: string;
  title: string;
  content: string;
  tag: string;
  edited_at: number; // 0 if never edited
  thumbnail: string;
  points: number;
  comments: number;
  user_vote: number; // -1, 0, 1
  user_weight: number; // viewer's weighted contribution
}

// Hook: usePosts with infinite query
// Hook: useInfinitePosts for pagination
// staleTime: 1 minute
```

**Display Points Calculation:**

```typescript
const displayPoints = Math.round(
  post.points - post.user_weight + post.user_vote
);
```

#### `GET / `

**Purpose**: User's submissions or comments

```typescript
interface GetUserPostsParams {
  owner: string; // Required
  address?: string; // Viewer address
  type?: "submissions" | "comments";
  page?: number;
  limit?: number; // max 50
}

// Hook: useUserPosts
```

#### `GET /p/[id]`

**Purpose**: View a single post or comment with its full comment tree. Replaces `GET /view_post?post_id=...`.

- Works for both posts and comments
- Optional `?depth=1-5` query param to include parent context (replaces `GET /get_comment_context`)

```typescript
interface GetPostDetailParams {
  id: string; // post or comment txhash
  address?: string; // Viewer address
  depth?: number; // 1-5, optional parent context depth
}

interface PostDetailResponse {
  root: PostWithChildren;
  children: PostWithChildren[];
  latest_inbox_timestamp?: number;
  context?: Post[]; // Parent chain when depth is specified
}

interface PostWithChildren extends Post {
  children: PostWithChildren[];
}

// Hook: usePostDetail
// staleTime: 30 seconds
// Note: When viewing a comment, depth=1-5 returns parent posts for context
```

> **Note**: `GET /get_root_post_id` and `GET /get_comment_context` are no longer needed — their
> functionality is now built into `/p/[id]` via the `?depth` parameter.

---

### 4. Inbox

#### `GET /get_inbox`

```typescript
interface GetInboxParams {
  address: string; // Required
  page?: number;
  limit?: number; // max 100
}

interface InboxResponse {
  replies: InboxReply[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

interface InboxReply {
  reply_id: string;
  reply_owner: string;
  reply_username: string;
  reply_content: string;
  reply_timestamp: number;
  parent_id: string;
  parent_content: string;
  parent_owner: string;
  root_post_id: string;
}

// Hook: useInbox
// Hook: useInfiniteInbox
```

---

### 5. Topics

#### `GET /get_topics`

```typescript
interface GetTopicsParams {
  limit?: number; // max 200
}

interface TopicsResponse {
  topics: TopicInfo[];
}

interface TopicInfo {
  topic: string;
  post_count?: number;
  // Additional fields may vary
}

// Hook: useTopics
// staleTime: 10 minutes
```

#### `GET /search_topics`

```typescript
interface SearchTopicsParams {
  q: string; // min 2 chars
  limit?: number; // max 50
  offset?: number;
}

interface SearchTopicsResponse {
  topics: {
    topic: string;
    post_count: number;
    count: number;
    flags: string[];
    dominant_tag: string;
    dominant_ratio: number;
  }[];
}

// Hook: useSearchTopics
```

---

### 6. Search

#### `GET /search`

```typescript
interface SearchParams {
  q: string;
  type?: "topics" | "users" | "posts";
  limit?: number; // max 50
  offset?: number;
  address?: string; // Viewer for blocked filtering
}

interface SearchResponse {
  query: string;
  search_type: string;
  topics: TopicInfo[];
  users: UserInfo[];
  posts: Post[];
  has_more_topics: boolean;
  has_more_users: boolean;
  has_more_posts: boolean;
}

// Hook: useSearch
// Note: Prefix @ for users, # for topics
```

---

### 7. Username/Address Resolution

#### `GET /get_address_from_username`

```typescript
interface AddressFromUsernameResponse {
  exists: boolean;
  address: string | null;
  username: string;
}

// Hook: useAddressFromUsername
// Also: POST for bulk lookup
```

#### `GET /get_username_from_address`

```typescript
interface UsernameFromAddressResponse {
  username: string | null;
  address: string;
}

// Hook: useUsernameFromAddress
// Also: POST for bulk lookup
```

#### `GET /get_users`

```typescript
interface GetUsersParams {
  limit?: number; // max 500
  page?: number;
  has_username?: boolean;
}

interface UsersResponse {
  users: { address: string; username: string }[];
  page: number;
  limit: number;
  has_more: boolean;
  total: number;
}

// Hook: useUsers
```

---

### 8. Transaction Status

#### `GET /get_tx_status`

**Purpose**: Poll for transaction confirmation

```typescript
interface TxStatusResponse {
  found: boolean;
  tx_hash?: string;
  height?: number;
  code?: number; // 0 = success
  success?: boolean;
  indexed?: boolean; // Indexer processed
  tx_type?:
    | "vote"
    | "post"
    | "profile"
    | "follow_user"
    | "follow_topic"
    | "unknown";
  details?: TxDetails; // Type-specific, only when indexed & success
  error_details?: string; // When code != 0
}

// Vote details
interface VoteDetails {
  owner: string;
  target: string;
  user_vote: number;
  user_weight: number;
  target_points: number;
}

// Post details
interface PostDetails {
  post_id: string;
  topic: string;
  title: string;
}

// Hook: useTxStatus with polling
// Polling: Wait 4s after submit, then poll every 2s, max 5 attempts
```

**Polling Hook Pattern:**

```typescript
export function useTxStatusPolling(txHash: string | null) {
  return useQuery({
    queryKey: queryKeys.txStatus(txHash!),
    queryFn: () => getTxStatus(txHash!),
    enabled: !!txHash,
    refetchInterval: (data) => {
      if (!data) return 2000;
      if (data.found && data.indexed) return false; // Stop polling
      return 2000; // Continue polling
    },
    refetchIntervalInBackground: false,
  });
}
```

---

### 9. Stats & Network

#### `GET /get_network_stats`

```typescript
interface NetworkStatsResponse {
  server_balance: number;
  block_time: number;
  pow_difficulty: number;
  pow_message_count: number;
  pow_calm_sequence: number;
  pow_last_change_height: number;
  current_height: number;
  difficulty_history: {
    height: number;
    difficulty: number;
    msg_count: number;
    timestamp: number;
  }[];
}

// Hook: useNetworkStats
```

#### `GET /get_circulation_stats`

```typescript
interface CirculationStatsResponse {
  total_supply: number;
  top_accounts: {
    address: string;
    username: string;
    balance: number;
  }[];
}

// Hook: useCirculationStats
```

#### `GET /get_stats`

```typescript
interface AppStatsResponse {
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

// Hook: useAppStats
```

#### `GET /leaderboard`

```typescript
interface LeaderboardParams {
  days?: number; // 1-30
  limit?: number; // max 500
  page?: number;
  // Weight params
  comment_weight?: number;
  post_weight?: number;
  points_received_weight?: number;
  votes_cast_weight?: number;
  deleted_post_weight?: number;
  deleted_comment_weight?: number;
}

interface LeaderboardResponse {
  since_ts: number;
  days: number;
  limit: number;
  page: number;
  total: number;
  leaderboard: LeaderboardEntry[];
}

interface LeaderboardEntry {
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

// Hook: useLeaderboard
```

---

### 10. Referral

#### `GET /referral/stats`

```typescript
interface ReferralStatsResponse {
  pending_total: number;
  paid_total: number;
  total_referrals: number;
  referral_tree: ReferralNode;
  referred_by?: string;
  last_update_ts: number;
  next_update_ts: number;
}

interface ReferralNode {
  address: string;
  username?: string;
  children: ReferralNode[];
}

// Hook: useReferralStats
```

---

### 11. Peers

#### `GET /get_peers`

```typescript
interface PeersResponse {
  peers: {
    ip: string;
    moniker: string;
  }[];
}

// Hook: usePeers
```

---

### 12. Media Upload

#### `POST /get_upload_url`

```typescript
interface GetUploadUrlParams {
  type: "image" | "video";
}

interface ImageUploadResponse {
  uploadURL: string;
  id: string;
  accountHash: string;
}

interface VideoUploadResponse {
  uploadURL: string;
  provider: "stream";
  streamCustomer: string;
  uid: string;
}

// Hook: useUploadUrl (mutation, but listed here as it's a read-ish operation)
```

---

## Hook Implementation Pattern

```typescript
// src/api/read/hooks/use-posts.ts

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getPosts, type GetPostsParams } from "../endpoints/posts";
import { useAuthStore } from "@/stores/auth-store";

export function usePosts(params: Omit<GetPostsParams, "address">) {
  // Get address from auth store (may be null if not logged in)
  const address = useAuthStore((s) => s.walletAddress);

  const fullParams = { ...params, address: address ?? undefined };

  return useQuery({
    queryKey: queryKeys.posts(fullParams),
    queryFn: () => getPosts(fullParams),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useInfinitePosts(
  params: Omit<GetPostsParams, "page" | "address">
) {
  const address = useAuthStore((s) => s.walletAddress);
  const fullParams = { ...params, address: address ?? undefined };

  return useInfiniteQuery({
    queryKey: queryKeys.posts({ ...fullParams, page: undefined }),
    queryFn: ({ pageParam = 1 }) =>
      getPosts({ ...fullParams, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more) return undefined;
      return lastPage.page + 1;
    },
    staleTime: 1000 * 60,
  });
}
```

### Hooks That Require Address

For endpoints that require an address, the hook should be disabled when no wallet exists:

```typescript
// src/api/read/hooks/use-inbox.ts

export function useInbox(params?: { page?: number; limit?: number }) {
  const address = useAuthStore((s) => s.walletAddress);

  return useQuery({
    queryKey: queryKeys.inbox(address!, params?.page),
    queryFn: () => getInbox({ address: address!, ...params }),
    enabled: !!address, // Only fetch when wallet exists
    staleTime: 1000 * 30,
  });
}
```

---

## Cache Invalidation Strategy

```typescript
// After mutations, invalidate related queries

// After vote
queryClient.invalidateQueries({ queryKey: ["posts"] });
queryClient.invalidateQueries({ queryKey: queryKeys.userStatus(address) });

// After post/comment
queryClient.invalidateQueries({ queryKey: ["posts"] });
queryClient.invalidateQueries({ queryKey: ["postDetail"] });

// After follow/unfollow
queryClient.invalidateQueries({ queryKey: queryKeys.userFollowed(address) });
queryClient.invalidateQueries({ queryKey: queryKeys.profile(address) });

// After username set
queryClient.invalidateQueries({ queryKey: queryKeys.userStatus(address) });
queryClient.invalidateQueries({ queryKey: queryKeys.profile(address) });
```

---

## Testing Checklist

- [ ] All hooks return correct types
- [ ] Pagination works with infinite queries
- [ ] Cache persists across app restarts
- [ ] Stale data shows while refetching
- [ ] Error states handled properly
- [ ] Loading states work correctly
- [ ] Query invalidation triggers refetch
- [ ] TX status polling stops when confirmed
