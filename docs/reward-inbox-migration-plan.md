# Reward & Inbox API Migration Plan

> Migrate the app from the old 3-endpoint reward system + client-side inbox tracking
> to the new consolidated `GET /rewards/summary` endpoint and server-side `new_inbox_items` middleware.

---

## Summary of Backend Changes

### Rewards

| Before | After |
|---|---|
| `GET /rewards/daily` | **Removed** |
| `GET /rewards/flash` | **Removed** |
| `GET /rewards/pending` | **Removed** |
| — | `GET /rewards/summary` (single call, all data) |
| — | `GET /rewards/achievements` (separate page) |
| `POST /rewards/claim` | **Unchanged** (now claims all pending rewards, response includes `tx_hash`) |

### Inbox

| Before | After |
|---|---|
| Client-side `InboxStore` tracking `unreadReplyIds` | Server-side `new_inbox_items` on every API response |
| No "mark as read" API | `POST /mark_inbox_viewed` resets count |

---

## Phase 1: Reward Endpoint Migration

### 1.1 Update Types — `src/api/read/endpoints/quests.ts`

Replace the existing types and endpoint functions with the new consolidated shape.

**Remove:**
- `DailyQuestsResponse` type (was keyed to `/rewards/daily`)
- `PendingRewardsResponse` type (was keyed to `/rewards/pending`)
- `getDailyQuests()` function
- `getPendingRewards()` function

**Add:**
```typescript
interface QuestReward {
  type: "mirage";
  amount: number;
  apply_multiplier: boolean;
}

interface DailyQuest {
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

interface FlashQuest {
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

interface PendingRewardRow {
  id: number;
  type: "mirage";
  data: { amount: number; apply_multiplier: boolean };
  reason: string;
  created_at: number;
}

interface RewardSummaryResponse {
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
}

interface Achievement {
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

interface AchievementsResponse {
  achievements: Achievement[];
}

function getRewardSummary(params: { address: string }): Promise<RewardSummaryResponse>
// calls GET /rewards/summary?owner=<address>

function getAchievements(params: { address: string }): Promise<AchievementsResponse>
// calls GET /rewards/achievements?owner=<address>
```

Rename the file from `quests.ts` → `rewards.ts` (or keep and refactor in-place).

### 1.2 Update Query Keys — `src/api/read/query-keys.ts`

**Remove:**
- `dailyQuests: (address) => [...]`
- `pendingRewards: (address) => [...]`

**Add:**
```typescript
rewardSummary: (address: string) => ["rewards", "summary", address] as const,
achievements: (address: string) => ["rewards", "achievements", address] as const,
```

### 1.3 Update Hooks — `src/api/read/hooks/use-daily-quests.ts`

Replace the 4 existing hooks with 2 new hooks:

**Remove:**
- `useDailyQuests()`
- `useDailyQuestsByAddress()`
- `usePendingRewards()`
- `usePendingRewardsByAddress()`

**Add:**
```typescript
function useRewardSummary()
// Uses walletAddress from auth store
// queryKey: queryKeys.rewardSummary(address)
// staleTime: 1 minute, gcTime: 5 minutes

function useRewardSummaryByAddress(address: string | undefined)
// For viewing other users' quest progress (if needed)

function useAchievements()
// Uses walletAddress from auth store
// queryKey: queryKeys.achievements(address)
// staleTime: 5 minutes

function useAchievementsByAddress(address: string | undefined)
```

Rename file to `use-reward-summary.ts`.

### 1.4 Update Hook Exports — `src/api/read/hooks/index.ts`

Replace the `// Daily Quests` section:

```typescript
// Rewards
export {
  useRewardSummary,
  useRewardSummaryByAddress,
  useAchievements,
  useAchievementsByAddress,
} from "./use-reward-summary";
```

### 1.5 Update Endpoint Exports — `src/api/read/endpoints/index.ts`

Replace `getDailyQuests, getPendingRewards` exports with `getRewardSummary, getAchievements`.

### 1.6 Update Consumers

#### `src/pages/quests-screen.tsx`

Currently uses:
- `useDailyQuests()` → access `.daily_quests`, `.seconds_until_reset`, `.reward_multiplier`, `.suspended`
- `usePendingRewards()` → access `.pending_rewards`, `.total_mirage_after_multiplier`, `.claiming_available`

**Migrate to:**
- `useRewardSummary()` — single hook returns everything
- `data.daily_quests` — same shape
- `data.pending_rewards` — shape changed: each row now has `.id`, `.data.amount`, `.reason` instead of `.quest_id`, `.amount`
- `data.flash_quest` — new, render flash quest card if not null
- `data.claiming_available` — same
- `data.total_mirage_after_multiplier` — same

Key changes in the screen:
- Remove the separate `pendingData` variable — everything comes from one `data` object
- Update reward-completed detection: check `data.pending_rewards.length > 0` directly
- Add flash quest UI section (countdown timer using `seconds_remaining`)

#### `src/components/molecules/quests-summary-card.tsx`

Currently uses both `useDailyQuests()` and `usePendingRewards()`.

**Migrate to:**
- `useRewardSummary()` — single hook
- Access `data.daily_quests`, `data.pending_rewards`, `data.reward_multiplier` from same object
- Add flash quest mini-card when `data.flash_quest` is not null

#### `src/api/write/hooks/use-claim-reward.ts`

Currently invalidates `queryKeys.dailyQuests(walletAddress)`.

**Migrate to:**
- Invalidate `queryKeys.rewardSummary(walletAddress)` instead

#### `src/api/write/endpoints/rewards.ts`

The `POST /rewards/claim` endpoint response shape has changed:

**Old:** `{ success, amount?, message? }`
**New:** `{ success, rewards: [{ type, amount }], tx_hash }` on success, or `{ success: false, error, message }` on error.

Update `ClaimRewardResponse` type accordingly.

---

## Phase 2: Inbox Badge Migration

### 2.1 Update API Client — `src/api/client.ts`

Intercept every API response to extract `new_inbox_items` and update a store.

```typescript
// In the response interceptor or wrapper:
if (response.new_inbox_items !== undefined) {
  useInboxStore.getState().setUnreadCount(response.new_inbox_items);
}
```

### 2.2 Update Inbox Store — `src/stores/inbox-store.ts`

Simplify the store — replace `unreadReplyIds: string[]` tracking with a simple count.

**Remove:**
- `unreadReplyIds: string[]`
- `addUnreadReplyIds(ids)`

**Add:**
```typescript
interface InboxState {
  unreadCount: number;
  hasUnread: boolean;
  setUnreadCount: (count: number) => void;
  markAsViewed: () => void;
}
```

`markAsViewed()` should call `POST /mark_inbox_viewed` and optimistically set count to 0.

### 2.3 Add Mark Inbox Viewed Endpoint

**New file or add to existing:** `src/api/write/endpoints/inbox.ts`

```typescript
async function markInboxViewed(address: string): Promise<{ ok: boolean; inbox_last_viewed_at: number }>
// POST /mark_inbox_viewed { address }
```

### 2.4 Update Tab Layout Badge — `app/(tabs)/_layout.tsx`

Currently reads `useInboxStore((s) => s.hasUnread)`.

**Migrate to:**
- `useInboxStore((s) => s.unreadCount)` for the count
- Show numbered badge (cap at "99+")
- Hide when 0

### 2.5 Update Inbox Screen — `src/pages/inbox-screen.tsx`

Currently calls `markAllAsRead()` which only clears local state.

**Migrate to:**
- On mount, call `markInboxViewed(address)` to tell the server
- Optimistically set `unreadCount = 0` in the store

### 2.6 Update Background Notification Service — `src/services/inbox-notifications.ts`

Currently calls `GET /get_inbox` and tracks reply IDs locally via `addUnreadReplyIds()`.

**Migrate to:**
- Still call `GET /get_inbox` for push notification content (need the actual reply text)
- Remove the `addUnreadReplyIds()` call — the server now tracks the count
- The foreground badge is handled by the `new_inbox_items` middleware

---

## Phase 3: Cleanup

### 3.1 Remove Dead Code

- Delete old query key entries (`dailyQuests`, `pendingRewards`)
- Delete old hook file or rename
- Remove `unreadReplyIds` persistence from MMKV (migration in inbox-store)
- Remove `latest_inbox_timestamp` handling from post/comment response types (if no longer needed)

### 3.2 Update Preferences Store

`src/stores/preferences-store.ts` has `questsCardExpanded` — this stays unchanged.

---

## File Change Summary

| File | Action |
|---|---|
| `src/api/read/endpoints/quests.ts` | Rewrite → `rewards.ts` with new types + `getRewardSummary()`, `getAchievements()` |
| `src/api/read/endpoints/index.ts` | Update exports |
| `src/api/read/hooks/use-daily-quests.ts` | Rewrite → `use-reward-summary.ts` with `useRewardSummary()`, `useAchievements()` |
| `src/api/read/hooks/index.ts` | Update exports |
| `src/api/read/query-keys.ts` | Replace `dailyQuests`/`pendingRewards` with `rewardSummary`/`achievements` |
| `src/api/write/endpoints/rewards.ts` | Update `ClaimRewardResponse` type, update claim to `POST /rewards/claim` with new body |
| `src/api/write/hooks/use-claim-reward.ts` | Invalidate `rewardSummary` instead of `dailyQuests` |
| `src/pages/quests-screen.tsx` | Use `useRewardSummary()`, add flash quest UI, update pending reward shape |
| `src/components/molecules/quests-summary-card.tsx` | Use `useRewardSummary()`, add flash quest mini-card |
| `src/stores/inbox-store.ts` | Simplify to `unreadCount` + `setUnreadCount()` + `markAsViewed()` |
| `src/api/client.ts` | Add `new_inbox_items` extraction from every response |
| `src/api/write/endpoints/inbox.ts` | **New** — `markInboxViewed()` |
| `app/(tabs)/_layout.tsx` | Read `unreadCount` for numbered badge |
| `src/pages/inbox-screen.tsx` | Call `markInboxViewed()` on mount |
| `src/services/inbox-notifications.ts` | Remove `addUnreadReplyIds()`, keep push notification logic |

---

## Testing Checklist

- [ ] `useRewardSummary()` returns daily quests, flash quest, pending rewards in one call
- [ ] Quest progress updates after vote/post/comment (invalidation works)
- [ ] Flash quest countdown renders correctly with `seconds_remaining`
- [ ] Reward claiming works with new response shape (`tx_hash`)
- [ ] `useAchievements()` loads and renders achievement list
- [ ] Inbox badge updates from `new_inbox_items` on any API response
- [ ] Badge shows correct count, caps at "99+"
- [ ] Opening inbox calls `POST /mark_inbox_viewed` and clears badge
- [ ] Background notifications still fire for new replies
- [ ] Old query keys (`dailyQuests`, `pendingRewards`) are fully removed
- [ ] MMKV migration handles removal of `unreadReplyIds`
