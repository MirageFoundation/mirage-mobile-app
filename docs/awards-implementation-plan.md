# Awards System — Implementation Plan

Complete step-by-step plan for adding the awards feature to the Mirage mobile app.
Based on `awards-technical.md` and the existing codebase patterns.

---

## Overview

Awards let users spend MIRAGE to recognize posts and comments. Users tap "Give Award" in post/comment option sheets, pick an award type from a bottom sheet, confirm, and submit. The app handles signing, sending, optimistic updates, and toast feedback — following the same patterns used for votes, follows, and other write operations.

---

## Phase 1: Types & API Layer

### 1.1 Add Award Types to `src/api/types.ts`

Add these new types alongside existing ones:

```ts
// ============================================
// Award Types
// ============================================

export interface AwardConfig {
  name: string;       // e.g. "quality_post"
  cost: number;       // umirage
}

export interface AwardBadge {
  type: string;       // matches AwardConfig.name
  count: number;      // number of unique users who gave this award
}

export interface InboxReply {
  // ... existing fields ...
  type?: "reply" | "mention" | "award";  // ADD "award"
  award_type?: string;                    // e.g. "quality_post" (empty string for non-awards)
}
```

Update `Post` type:
```ts
export interface Post {
  // ... existing fields ...
  awards?: AwardBadge[];  // aggregated awards on this post
}
```

### 1.2 Award Config Map (Client-Side)

Create `src/data/awards.ts`:

```ts
export interface AwardTypeInfo {
  name: string;
  icon: string;       // emoji
  label: string;
  description?: string;
}

export const AWARD_TYPES: Record<string, AwardTypeInfo> = {
  quality_post:     { name: "quality_post",     icon: "🏆", label: "Quality Post Award" },
  original_content: { name: "original_content", icon: "💡", label: "Original Content Award" },
  based:            { name: "based",            icon: "💪", label: "Based AF Award" },
  receipts:         { name: "receipts",         icon: "🏷️", label: "Receipts Award" },
};

export function getAwardInfo(type: string): AwardTypeInfo | undefined {
  return AWARD_TYPES[type];
}

export function formatAwardCost(costUmirage: number): string {
  return `${(costUmirage / 1_000_000).toLocaleString()} MIRAGE`;
}
```

### 1.3 Fetch Award Configs from Chain

The `GET /api/get_chain_config` response will include `award_configs`. Our existing `getChainConfig()` in `src/api/read/endpoints/parameters.ts` already fetches this endpoint.

**Update `ConfigResponse` in `src/api/types.ts`:**
```ts
export interface ConfigResponse {
  // ... existing fields ...
  award_configs?: AwardConfig[];
}
```

**Caching:** Use react-query with a 24-hour stale time. Create a hook `useAwardConfigs()` in `src/api/read/hooks/`.

---

## Phase 2: Signing & Write Endpoint

### 2.1 Canonical Byte Builder

Add to `src/api/write/signing/canonical.ts`:

```ts
// --- MsgAward ---

export interface AwardParams extends BaseParams {
  target: string;      // 64-char hex txhash of post/comment
  award_type: string;  // award type name
}

export function canonBaseAward(params: AwardParams): Uint8Array {
  return concatBytes(
    prefix("MsgAward"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.award_type)
  );
}
```

**Export from `src/api/write/signing/index.ts`** — add `canonBaseAward` and `AwardParams` to the exports.

### 2.2 Write Endpoint

Create `src/api/write/endpoints/award.ts`:

```ts
import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseAward } from "../signing";
import type { WriteResponse } from "../signing";

export interface GiveAwardInput {
  target: string;      // txhash of post/comment
  award_type: string;  // from award_configs
}

export async function giveAward(
  wallet: MirageWallet,
  input: GiveAwardInput
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseAward,
    payloadFields: {
      target: input.target.toLowerCase(),
      award_type: input.award_type,
    },
    skipPoW: true,   // Awards never require PoW
  });

  return api.post<WriteResponse>("/core/award", payload);
}
```

Key difference from other endpoints: **`skipPoW: true`** — awards never require PoW, difficulty and pow must be 0.

**Export from `src/api/write/endpoints/index.ts` and `src/api/write/index.ts`.**

### 2.3 Mutation Hook

Create `src/api/write/hooks/use-award.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { giveAward, type GiveAwardInput } from "../endpoints/award";

export function useGiveAward() {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (input: GiveAwardInput) => {
      const wallet = await getWallet();
      return giveAward(wallet, input);
    },
    onSuccess: () => {
      // Invalidate post/comment queries to pick up new awards
      queryClient.invalidateQueries({ queryKey: ["posts"], refetchType: "none" });
      queryClient.invalidateQueries({ queryKey: ["comments"], refetchType: "none" });
    },
  });
}
```

**Export from `src/api/write/hooks/index.ts` and `src/api/write/index.ts`.**

---

## Phase 3: UI Components

### 3.1 Award Picker Bottom Sheet

Create `src/components/molecules/award-picker-sheet.tsx`:

This is the main UI the user interacts with. It's a bottom sheet that:
1. Shows all available award types as selectable cards
2. Shows the cost for each award
3. Shows the user's current balance
4. Has a "Send Award" button after selection
5. Shows sending status inline (no separate modal since no PoW needed)

**Pattern:** Use `@gorhom/bottom-sheet` `BottomSheetModal` — same as `PostOptionsSheet` and `CommentOptionsSheet`.

```
┌─────────────────────────────┐
│  Give Award           [✕]   │
│─────────────────────────────│
│  Balance: 50,000 MIRAGE     │
│                             │
│  ┌─────────────────────┐    │
│  │ 🏆 Quality Post     │    │
│  │ 10,000 MIRAGE       │ ◉  │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ 💡 Original Content │    │
│  │ 5,000 MIRAGE        │ ○  │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ 💪 Based AF         │    │
│  │ 5,000 MIRAGE        │ ○  │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ 🏷️ Receipts         │    │
│  │ 5,000 MIRAGE        │ ○  │
│  └─────────────────────┘    │
│                             │
│  [     Send Award ✨     ]  │
│                             │
└─────────────────────────────┘
```

**States:**
- **Idle:** Shows award list with radio selection
- **Sending:** Button shows spinner, disabled state
- **Success:** Toast shown via `useToast().success()`, sheet dismisses
- **Error:** Toast shown via `useToast().error()` with friendly message, sheet stays open

**Props:**
```ts
type AwardPickerSheetProps = {
  targetId: string;          // post/comment txhash
  targetType: "post" | "comment";
  isOwnContent?: boolean;    // prevent self-awards
  onDismiss?: () => void;
  onSuccess?: () => void;
};
```

**Ref pattern:**
```ts
export type AwardPickerSheetRef = {
  present: () => void;
  dismiss: () => void;
};
```

### 3.2 Award Badges Display

Create `src/components/atoms/award-badges.tsx`:

A horizontal row of award badges displayed on posts/comments. Follows the display logic from the spec.

```
🏆 3x  💪
```

**Props:**
```ts
type AwardBadgesProps = {
  awards: AwardBadge[];
  size?: "sm" | "md";
};
```

- For each award: show icon, and `{count}x` if count > 1
- Long-press/press shows tooltip with full label name
- Inline, horizontal layout with small gap

### 3.3 Integrate into Post Options Sheet

In `src/components/molecules/post-options-sheet.tsx`:

**Add a new prop:**
```ts
onGiveAward?: () => void;
```

**Add a new menu item** (before the destructive items, after "Share"):
```tsx
{!isOwnPost && (
  <MenuItem
    iconComponent={Ionicons}
    iconName="gift-outline"
    title="Give Award"
    onPress={handleGiveAward}
  />
)}
```

The parent component (where `PostOptionsSheet` is used) will:
1. Dismiss the options sheet
2. Present the `AwardPickerSheet`

### 3.4 Integrate into Comment Options Sheet

Same pattern in `src/components/molecules/comment-options-sheet.tsx`:

**Add prop:** `onGiveAward?: () => void;`

**Add menu item** (after Save, before destructive items):
```tsx
{!isOwnComment && (
  <MenuItem
    iconComponent={Ionicons}
    iconName="gift-outline"
    title="Give Award"
    onPress={handleGiveAward}
  />
)}
```

---

## Phase 4: Integration Points

### 4.1 Post Detail Screen (`app/post/[id].tsx`)

This is the main screen where both post and comment options are used. Here we need to:

1. Add `AwardPickerSheet` ref
2. State for which target (post or comment) is being awarded
3. Wire up `onGiveAward` callbacks from both option sheets
4. Handle dismiss → present flow (dismiss options sheet, then present award picker)
5. On success: apply optimistic update to awards array

### 4.2 Home Feed / Post Cards

In screens that render post cards (`home-screen.tsx`, `following-screen.tsx`, `topic-feed-screen.tsx`, etc.):

1. Add `AwardPickerSheet` ref (one per screen, reused for all posts)
2. Pass `onGiveAward` to `PostOptionsSheet`
3. Display `AwardBadges` component on post cards (in the metadata area near post-actions)

### 4.3 Award Badges on Post Cards

In `src/components/molecules/post-card.tsx` or `post-card-content.tsx`:

Add the `AwardBadges` component. Position it in the metadata row, near the points/comments/share actions area.

```tsx
{post.awards && post.awards.length > 0 && (
  <AwardBadges awards={post.awards} size="sm" />
)}
```

### 4.4 Award Badges on Comments

In `src/components/molecules/comment-item.tsx`:

Add `AwardBadges` component in the comment metadata area (near vote buttons).

---

## Phase 5: Optimistic Updates & Balance Hold

### 5.1 Optimistic Award Update

In the `useGiveAward` hook's `onMutate`:

```ts
onMutate: async ({ target, award_type }) => {
  // Cancel outgoing refetches
  await queryClient.cancelQueries({ queryKey: ["posts"] });
  await queryClient.cancelQueries({ queryKey: ["comments"] });

  // Snapshot for rollback
  const previousPosts = queryClient.getQueriesData({ queryKey: ["posts"] });
  const previousComments = queryClient.getQueriesData({ queryKey: ["comments"] });

  // Optimistic: add award badge to the target post/comment in cache
  // (update awards array: increment if exists, append if new)

  return { previousPosts, previousComments };
},
onError: (err, variables, context) => {
  // Rollback
  if (context?.previousPosts) {
    for (const [key, data] of context.previousPosts) {
      queryClient.setQueryData(key, data);
    }
  }
  // Same for comments
},
```

### 5.2 Balance Hold

After a successful award submission:
1. Deduct the award cost from displayed balance immediately
2. Set a 15-second hold flag (via a ref or zustand store)
3. During the hold, skip overwriting the balance from server refreshes unless the server value is lower
4. After 15 seconds, allow normal balance refreshes

This can be implemented in the auth store or a dedicated balance store.

### 5.3 Error Message Mapping

In the `AwardPickerSheet` error handling:

```ts
function getFriendlyAwardError(message: string): string {
  if (message.includes("already awarded"))
    return "You already gave this post an award.";
  if (message.includes("insufficient") || message.includes("not enough"))
    return "Not enough MIRAGE to give this award.";
  if (message.includes("own post") || message.includes("self-award"))
    return "You can't award your own post.";
  return "Something went wrong. Please try again.";
}
```

---

## Phase 6: Inbox Award Notifications

### 6.1 Update InboxReply Type

In `src/api/types.ts`, update:
```ts
export interface InboxReply {
  // ... existing ...
  type?: "reply" | "mention" | "award";
  award_type?: string;
}
```

### 6.2 Update InboxItem Component

In `src/components/molecules/inbox-item.tsx`:

- Detect `type === "award"` 
- Show award-specific icon (e.g., trophy or gift icon) instead of reply/mention icon
- Change action label: `"{username} gave your post a '{Award Label}' award"`
- Show the award emoji next to the label

```tsx
const isAward = reply.type === "award";
const isMention = reply.type === "mention";

const actionLabel = isAward
  ? `gave your post a '${getAwardInfo(reply.award_type)?.label}' award`
  : isMention ? "mentioned you in" : "replied to";

const actionIcon = isAward
  ? "gift-outline"
  : isMention ? "at-outline" : "arrow-undo-outline";
```

---

## Phase 7: Award Badges on Feed Posts

### 7.1 Update Transform Post

In `src/api/read/utils/transform-post.ts`:

Map the `awards` array from the API response to the UI Post type.

```ts
export function transformApiPost(apiPost: ApiPost, options?: TransformPostOptions): UIPost {
  return {
    // ... existing ...
    awards: apiPost.awards ?? [],
  };
}
```

### 7.2 Update UI Post Type

In `src/components/molecules/post-card-types.ts`:
```ts
import type { AwardBadge } from "@/src/api/types";

export type Post = {
  // ... existing ...
  awards?: AwardBadge[];
};
```

---

## File Changes Summary

### New Files
| File | Description |
|------|-------------|
| `src/data/awards.ts` | Award type map (icons, labels, helpers) |
| `src/api/write/endpoints/award.ts` | `giveAward()` write endpoint |
| `src/api/write/hooks/use-award.ts` | `useGiveAward()` mutation hook |
| `src/api/read/hooks/use-award-configs.ts` | `useAwardConfigs()` query hook |
| `src/components/molecules/award-picker-sheet.tsx` | Award selection bottom sheet |
| `src/components/atoms/award-badges.tsx` | Award badges display component |

### Modified Files
| File | Changes |
|------|---------|
| `src/api/types.ts` | Add `AwardConfig`, `AwardBadge`, update `InboxReply.type`, update `Post`, update `ConfigResponse` |
| `src/api/write/signing/canonical.ts` | Add `canonBaseAward()` and `AwardParams` |
| `src/api/write/signing/index.ts` | Export new canonical builder |
| `src/api/write/endpoints/index.ts` | Export `giveAward` |
| `src/api/write/hooks/index.ts` | Export `useGiveAward` |
| `src/api/write/index.ts` | Export award endpoint + hook + signing |
| `src/components/molecules/post-options-sheet.tsx` | Add "Give Award" menu item + `onGiveAward` prop |
| `src/components/molecules/comment-options-sheet.tsx` | Add "Give Award" menu item + `onGiveAward` prop |
| `src/components/molecules/post-card-types.ts` | Add `awards` field to `Post` type |
| `src/components/molecules/post-card.tsx` | Render `AwardBadges` component |
| `src/components/molecules/comment-item.tsx` | Add `awards` to `Comment` type, render `AwardBadges` |
| `src/components/molecules/inbox-item.tsx` | Handle `type === "award"` display |
| `src/api/read/utils/transform-post.ts` | Map `awards` from API to UI Post |
| `app/post/[id].tsx` | Wire up award picker for post + comments |
| `src/pages/home-screen.tsx` | Wire up award picker for feed posts |
| `src/components/atoms/index.ts` | Export `AwardBadges` |
| `src/components/molecules/index.ts` | Export `AwardPickerSheet` |

---

## Implementation Order

1. **Types first** — `src/api/types.ts`, `src/data/awards.ts`, `post-card-types.ts`
2. **Signing** — `canonical.ts` + exports
3. **Write endpoint + hook** — `award.ts`, `use-award.ts` + exports
4. **Read hook** — `use-award-configs.ts` for fetching costs
5. **UI: Award Picker Sheet** — the main new component
6. **UI: Award Badges** — display component
7. **Wire up Options Sheets** — add "Give Award" to both post & comment sheets
8. **Wire up Post Detail** — `app/post/[id].tsx` integration
9. **Wire up Feed Screens** — home, following, topic feeds
10. **Inbox** — update inbox item for award notifications
11. **Optimistic updates & balance hold** — polish
12. **Testing & edge cases** — self-award prevention, insufficient balance, already awarded

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Bottom sheet (not new screen) for award picker | Matches existing UX patterns (options sheets, report sheet). Faster, less navigation overhead. |
| No PoW / no transaction progress modal | Awards skip PoW entirely (`skipPoW: true`). The send is near-instant, so we use toast feedback instead of the full `TransactionProgressModal`. |
| Single `AwardPickerSheet` per screen, reused | Avoids mounting N sheets for N posts. Set target via state before presenting. |
| Toast for success/error (not modal) | Consistent with how the app handles quick operations. Uses existing `useToast()` from `toast-provider.tsx`. |
| Award configs from chain, cached 24h | Costs can change via governance. Never hardcode. Use react-query with long stale time. |
| `gift-outline` icon for "Give Award" menu item | Ionicons icon that clearly communicates the action. Consistent with existing icon usage. |

---

## Edge Cases to Handle

1. **Self-award prevention:** Check `isOwnPost`/`isOwnComment` before showing "Give Award" option
2. **Already awarded:** Handle 409 response with friendly message
3. **Insufficient balance:** Show cost vs balance in picker, disable send button if insufficient
4. **Not logged in:** Don't show "Give Award" option (same as other write actions)
5. **Deleted target:** Handle 404 gracefully
6. **Admin users (level >= 100):** Awards are free, show "Free" instead of cost
7. **Award configs empty:** Gracefully hide the feature if no configs returned
