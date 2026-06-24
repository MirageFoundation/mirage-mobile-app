# Compact Feed View Implementation Plan

## Status
- Created: 2026-06-25
- Branch: `feat/compact-feed-view`
- Goal: add a user-togglable feed density (Card view ↔ Compact view) across every feed in the app, matching the visual model used by the Mirage web `CardView` "compact" size.
- Dependency policy: no new dependencies. Reuse existing `react-native-unistyles` theme, `Ionicons`, `react-native-popup-menu`, and `zustand` persisted preferences.

## Background

The web (`reference/mirage-node/web/frontend/src/components/CardView.js`) exposes 3 card sizes via a `Storage.load('card_size', 'compact')` preference: `large` (the current mobile card), `compact`, and `media`. The compact mode:

- Shrinks the thumbnail to ~90×90 with a square media slot on the left and content stacked on the right.
- Reduces inner padding and gaps.
- Hides the full media body and shows only a small thumbnail next to the title.
- Keeps the title, topic/author/time meta row, and vote/comment actions on the right.
- Falls back to the standard card on small (<600px) viewports on web, but the mobile app will support compact natively (this is the requested feature).

Mobile already only ships the "card" (large) variant via `src/components/molecules/post-card.tsx`, fed through `home-post-card-item.tsx` (home/following/topic) and `post-card-item.tsx` (profile, user-profile, saved, history, search).

## Goals
- Add a persistent user preference for feed density: `"card" | "compact"`.
- Render an alternative compact row for each post when compact is selected.
- Surface a toggle UI in the header of every feed screen.
- Match existing theme tokens (`background.default`, `border.subtle`, `text.default`, `text.subtle`, `primary[500]`, spacing/radius) – no hard-coded colors.

## Non-Goals
- No change to post detail screen, comments, or post composition.
- No change to data fetching, query keys, mutations, or cache helpers.
- No change to scroll/visibility/autoplay logic. Compact rows do not autoplay video.
- No change to the existing PostCard for the card mode (behavior preservation).
- No new analytics events in phase 1. (Optional: `feed_density_changed` can be added later under existing wrapper rules in `AGENTS.md`.)

## Architecture Overview

### 1. Preference store
Extend `src/stores/preferences-store.ts`:

- Add a type `FeedDensity = "card" | "compact"`.
- Add state `feedDensity: FeedDensity` (default `"card"`, persisted).
- Add action `setFeedDensity(density: FeedDensity)`.
- Export a small selector hook `useFeedDensity()` that returns `[density, setDensity]` for ergonomic use from headers/feeds.

This follows the established preference pattern (`feedType`, `theme`, `autoPlayVideos`, etc.). Persistence uses the existing `mmkvStorage`.

### 2. Compact post row component

New component: `src/components/molecules/post-card-compact.tsx`

Responsibilities:
- Render a single post in compact form: 90×90 square thumbnail on the left, title + meta + vote/comment row on the right.
- Reuse existing atoms:
  - `Avatar` (small) for the author tile (used inside meta row).
  - `TimeAgo` for the timestamp.
  - `MediaThumbnail` (already used elsewhere) for the square thumbnail; fall back to a gradient placeholder when there is no media (mirroring web's `pickPlaceholder`).
- Reuse existing helpers from `post-card-utils.ts` (`resolvePostContent`) so URL/media extraction stays consistent with the card view.
- Reuse `PostActions` in a "compact" mode (see below) for like / dislike / comment / share / more.
- Honor blur/content-warning logic (`shouldBlurContent`) by blurring the thumbnail and showing a small lock icon, but never fully hiding the row (consistent with web compact behavior).
- No video autoplay. If the post is a video, show the first frame / cover with a small `play` overlay icon.
- Memoized with a shallow `arePostCardCompactPropsEqual` comparator analogous to `arePostCardPropsEqual`.

Public API mirrors `PostCard` props that compact actually uses (subset):
```
post, isOwnPost, isTopicFollowed, showFollowButton, contentRevealed,
shareUrl, onPress, onAuthorPress, onTopicPress, onFollowUser,
onFollowTopic, onMorePress, onLikePress, onDislikePress, onCommentPress,
onSharePress, onBlockUser, onBlockPost, onBlockTopic, onReport,
onRevealContent, onMediaPress, onOptimisticRetryPress, style
```

Styling notes (theme-driven):
- Container: `paddingVertical: theme.spacing.sm`, `paddingHorizontal: theme.spacing.md`, `borderBottomWidth: 1`, `borderBottomColor: theme.colors.border.subtle`, `backgroundColor: theme.colors.background.default`.
- Thumbnail: 84–90px square, `borderRadius: theme.radius.md`, neutral gradient placeholder when no media.
- Title: `size="md"`, `weight="semibold"`, `numberOfLines={2}`.
- Meta row above title: `#topic · @username · 5d`, `size="xs"`, `color: theme.colors.text.subtle`.
- Action row (likes/dislikes/comments/share): smaller `IconButton` size, no background pills.

### 3. Compact action variant

`src/components/molecules/post-actions.tsx` already powers PostCard actions. Add a `compact?: boolean` prop (default `false`) that:
- Switches gap/spacing/icon size to a smaller set.
- Hides extended labels where appropriate (e.g. share label).
- Keeps every existing handler/prop the same so neither callsite has to change behavior.

If `post-actions.tsx` is too tightly coupled, fall back to a small inline `<PostCompactActions />` inside `post-card-compact.tsx` instead — the decision is made during implementation after re-reading the file, but the public PostActions API does not change.

### 4. Wiring into existing feeds

Update existing feed item wrappers to pick the right renderer based on `useFeedDensity`:

- `src/pages/home/home-post-card-item.tsx`
  - Read `useFeedDensity()`; render `<PostCard …>` for `"card"`, `<PostCardCompact …>` for `"compact"`.
  - Use the same handlers/refs the file already owns. Reuse the existing memo comparator (extended to include `density`).
  - In compact mode, skip the parts of the file that orchestrate video viewability and autoplay (they are no-ops for compact rows). Visibility tracking for "seen post" telemetry stays the same.

- `src/components/molecules/post-card-item.tsx` (used by profile, user-profile, saved, search, history)
  - Same swap: read density, return `PostCardCompact` or `PostCard`.
  - The wrapper already forwards all the relevant handlers, so this is the only change in those screens.

- `src/pages/home/home-post-list.tsx`
  - Update `ESTIMATED_ITEM_SIZE` to a derived value: `density === "compact" ? 120 : 420`. Pass density into the list via a prop and re-mount/key the list when density changes (cheaper than retrofitting FlashList's item size after the fact).

- Visibility tracking
  - Compact rows still emit `recordViewableItems` for seen tracking. Autoplay-related state is simply ignored because compact rows do not render `PostCardMedia`.

### 5. Toggle UI

Place the toggle in the existing feed headers so it appears on every feed. Add a small icon-only control (no extra row) to the existing right-section of:
- `src/components/molecules/feed-header.tsx` (Home + Following).
- `src/pages/topic/topic-feed-header.tsx` (Topic feed).
- A reusable "right-side toggle" element exported from a new file: `src/components/molecules/feed-density-toggle.tsx`. It wraps a `react-native-popup-menu` `Menu` with two options:
  - "Card view" (icon: `card-outline`).
  - "Compact view" (icon: `reorder-four-outline` or `list-outline`).
  - Active option uses `theme.colors.primary[500]` and `checkmark-circle`, mirroring the existing `feed-type` menu styling.
  - Trigger icon: `apps-outline` when card, `list-outline` when compact (or a single shared `swap-vertical` icon — final pick during build).
  - Haptic on change (`triggerHaptic("light")`).

For feeds without `FeedHeader` (`saved-posts-content.tsx`, `history-screen.tsx`), the toggle goes into the existing screen header's right-side actions next to the existing icons.

List of files that mount the toggle:
1. `src/components/molecules/feed-header.tsx` (covers `home-content.tsx` and `following-content.tsx`).
2. `src/pages/topic/topic-feed-header.tsx`.
3. `src/pages/saved/saved-posts-content.tsx` — header right side (replaces the placeholder).
4. `src/pages/history-screen.tsx` — header right side (alongside Clear).

Profile (`profile-content.tsx`), user-profile (`user-profile-content.tsx`), and search results (`search-content.tsx`) use full-bleed gradient headers / search-input headers where a density toggle would clash visually. They still **respect the global preference** — switching density on any other feed updates them too via `useFeedDensity()` inside `post-card-item.tsx`. A dedicated toggle for those headers can be added later as a follow-up if explicitly requested.

### 6. Visual mapping from web reference

From `reference/mirage-node/web/frontend/src/components/CardView.js` (`isCompact` branch ~lines 1632–1730):

| Web token | Mobile equivalent |
| --- | --- |
| `padding: '0.5rem 0.6rem'` | `theme.spacing.sm` vertical, `theme.spacing.md` horizontal |
| Thumbnail `90px × 90px`, `borderRadius: 8px` | `84×84`, `theme.radius.md` |
| `marginRight: '0.5rem'` between thumb and content | `theme.spacing.md` |
| Title `margin: '0.2rem 0'` | `marginTop: theme.spacing.xs`, `marginBottom: theme.spacing.xs` |
| Meta row `gap: '0.25rem'` | `gap: 6` |
| Card background | `theme.colors.background.default` |
| Card border | `theme.colors.border.subtle` |
| Title color | `theme.colors.text.default` |
| Meta color | `theme.colors.text.subtle` |
| Primary accent | `theme.colors.primary[500]` |

All values come from the existing theme. No new color tokens.

## File-by-file Change List

### New files
- `src/components/molecules/post-card-compact.tsx`
- `src/components/molecules/feed-density-toggle.tsx`

### Modified files
- `src/stores/preferences-store.ts`
  - Add `FeedDensity` type, `feedDensity` state, `setFeedDensity` action.
  - Export `useFeedDensity` selector hook.
- `src/components/molecules/index.ts`
  - Export `PostCardCompact` and `FeedDensityToggle`.
- `src/components/molecules/post-actions.tsx`
  - Optional `compact?: boolean` prop with tighter spacing and icon sizes. Default unchanged.
- `src/components/molecules/feed-header.tsx`
  - Slot `<FeedDensityToggle />` into the right section (left of the search icon).
- `src/pages/topic/topic-feed-header.tsx`
  - Slot `<FeedDensityToggle />` into the right section (left of the Follow pill).
- `src/pages/home/home-post-card-item.tsx`
  - Read density via `useFeedDensity`; conditionally render compact vs card. Extend memo comparator with density.
- `src/components/molecules/post-card-item.tsx`
  - Same swap for profile/user/saved/search/history feeds.
- `src/pages/home/home-post-list.tsx`
  - Density-aware `ESTIMATED_ITEM_SIZE`. Force list remount on density change via `key`.
- `src/pages/profile/profile-content.tsx`, `src/pages/user/user-profile-content.tsx`, `src/pages/saved/saved-posts-content.tsx`, `src/pages/search/search-content.tsx`, `src/pages/history-screen.tsx`
  - Mount the toggle in each existing header. No data/logic changes.

## Behavior Rules

1. The toggle is a global preference: switching density on any feed updates the value everywhere immediately.
2. Density is persisted via the existing MMKV storage layer used by other preferences.
3. Default value is `"card"` for all existing users and new installs (no migration needed; absent value resolves to `"card"`).
4. Compact view never autoplays video and never mounts heavy media (no `PostCardMedia`).
5. Compact view honors content warnings: blurred thumb + small warning indicator. Tapping the row reveals content the same way card view does (`onRevealContent`).
6. Compact view honors optimistic post state via a thin left border + status pill at the top, mirroring the existing optimistic indicator.
7. Tapping anywhere on the compact row navigates to the post detail (existing `onPress` handler).
8. The toggle uses `triggerHaptic("light")` on change.
9. Tabs/feeds that have a header but no post list (e.g. profile "About" tab) still show the toggle in the header — switching density there has no immediate visual effect on that tab but persists for posts tabs.

## Verification

Run the project-standard checks scoped to touched areas:

- `bun run lint`
- `bun run check:file-sizes`
- `bun run check:stores`
- `bun run check:architecture`
- `bunx tsc --noEmit` (or `bun run typecheck` if present)

Targeted smoke testing on a dev build:
- Home → toggle compact → scroll → toggle back to card → verify no flicker, scroll position OK after remount.
- Following / Topic / Profile / User profile / Saved / Search / History — verify toggle and rendering.
- Light + dark theme.
- Content-warning post in compact (blurred thumb, reveal works).
- Optimistic post in compact (pending → success/error → retry).
- Long titles, missing media, video-only posts, multi-image posts.
- Tablet/large screen sanity check.

## Phasing

### Phase 1 — Foundation
1. Extend preferences store + selector hook.
2. Build `PostCardCompact` (with inline compact actions if needed).
3. Build `FeedDensityToggle`.

### Phase 2 — Wire home + following + topic feeds
4. Swap `home-post-card-item.tsx` based on density.
5. Density-aware `ESTIMATED_ITEM_SIZE` + remount key in `home-post-list.tsx`.
6. Mount toggle in `FeedHeader` and `TopicFeedHeader`.

### Phase 3 — Wire remaining feeds
7. Swap `post-card-item.tsx` for profile/user/saved/search/history.
8. Mount toggle in those screen headers.

### Phase 4 — Polish + verification
9. Theme/density visual QA.
10. Run lint, architecture, store, file-size checks.
11. Manual smoke matrix above.

## Risks / Open Questions

- FlashList item-size accuracy: density swap mid-scroll can cause layout jumps. Mitigation: remount the list on density change via a derived `key` prop. Acceptable because density changes are rare and intentional.
- Compact action density on small phones: confirm minimum tap target stays ≥ 36–40px. Mitigation: keep `hitSlop` generous on each icon button.
- `PostActions` shared component: if injecting a `compact` mode adds too much branching, fall back to a dedicated `post-actions-compact.tsx` to keep the file under the 400-line soft warning per `AGENTS.md`.
- Long titles in compact view: enforce `numberOfLines={2}` on title, `numberOfLines={1}` on meta.
- Video posts in compact: no autoplay; cover frame + play overlay only.

## Out of Scope (Future Enhancements)

- Per-feed density override (e.g. compact for "Latest" but card for "Magic").
- A 3rd "media" mode (web has `media` size). Could be added later behind the same toggle once compact is shipped.
- Analytics event for density changes.
- Server-side personalization hooks (e.g. recommended density).
