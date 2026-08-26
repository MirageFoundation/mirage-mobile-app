# Scroll Performance Priority Plan

Status: working plan for app-wide list stutter on iOS and Android.

## Context
The stutter reproduces in production, across multiple list surfaces, including places without media. That suggests app-wide JS/render pressure rather than a single media-only issue.

## Priority Order

### 1. Centralize timestamp updates
**Status:** Done

**Problem**
- `TimeAgo` was creating per-instance timers/listeners.
- Post cards were also rerendering due to time tick propagation.

**Changes made**
- Added a single global time ticker.
- Removed per-row timer/listener behavior.
- Stopped whole post cards from rerendering only to refresh time labels.

**Files changed**
- `src/stores/time-tick-store.ts`
- `src/providers/root-provider.tsx`
- `src/components/atoms/time-ago.tsx`
- `src/components/molecules/post-card.tsx`
- `src/components/molecules/post-card-header.tsx`
- `src/pages/home/home-post-card-item.tsx`

---

### 2. Tune FlashList / FlatList rendering windows on main feeds
**Status:** Next

**Why**
- Main feeds still stutter after priority 1.
- Home/topic feeds are the highest-traffic scrolling surfaces.
- Large render windows and extra scroll work can increase JS and UI pressure.

**Primary targets**
- `src/pages/home/home-post-list.tsx`
- `src/pages/home/home-tabbed-feed.tsx`
- `src/pages/topic-feed-screen.tsx`
- `src/pages/profile-screen.tsx`
- `src/pages/user-profile-screen.tsx`
- `src/pages/inbox-screen.tsx`

**Likely actions**
- Reduce aggressive `drawDistance`.
- Remove no-op `onScroll` handlers.
- Revisit `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`.
- Re-check `removeClippedSubviews` usage screen by screen.

---

### 3. Audit per-item hooks and subscriptions
**Status:** Pending

**Why**
- Some row/media components still subscribe to app state or network-related hooks.
- Per-item subscriptions can create app-wide scroll pressure even if rows look simple.

**Primary targets**
- `src/components/molecules/post-card-media.tsx`
- `src/hooks/use-network-state.ts`
- any list-row component using polling/listeners indirectly

**Likely actions**
- Move shared state polling to a single provider/store.
- Avoid hook instances per list row wherever possible.

---

### 4. Reduce row complexity in high-volume lists
**Status:** Pending

**Why**
- Text-only rows can still be expensive because they render rich UI, markdown, previews, badges, menus, and conditional subtrees.

**Primary targets**
- `src/components/molecules/post-card.tsx`
- `src/components/molecules/inbox-item.tsx`
- `src/components/molecules/profile-comment-item.tsx`
- `src/pages/search-screen.tsx`

**Likely actions**
- Keep feed/body markdown optimization as a later step if earlier tuning is insufficient.
- Simplify preview rows before detail views.
- Memoize or split heavy subtrees where useful.

**Deferred for later**
- Replacing feed-row markdown with lighter plain-text previews.

---

### 5. Audit nested / non-scrolling list patterns
**Status:** Pending

**Why**
- Some screens still use `FlatList` with `scrollEnabled={false}` or other virtualization-weakening patterns.
- Not all of them are main feed paths, so they are lower priority than main feed tuning.

**Primary targets**
- `src/components/molecules/profile-posts-list.tsx`
- `src/pages/search-screen.tsx`
- any other nested list surfaces found during follow-up audit

**Likely actions**
- Replace nested disabled lists with simpler mapped content where item counts are small.
- Restore true scrolling ownership to one virtualized parent where counts are large.

---

### 6. Strip or reduce console logging in production paths
**Status:** Pending

**Why**
- React Native performance guidance explicitly warns about `console.*` impacting JS thread performance.
- The repo contains many log statements across services and UI paths.

**Likely actions**
- Remove noisy logs from hot paths.
- Add production log stripping if needed.

---

### 7. Add measurement and profiling checkpoints
**Status:** Pending

**Why**
- We should confirm impact after each change instead of stacking blind optimizations.

**Suggested checks after each priority**
- Home feed fling smoothness
- Following feed fling smoothness
- Topic feed fling smoothness
- Profile posts/comments scroll smoothness
- Inbox scroll smoothness
- JS FPS / UI FPS comparison on representative devices

## Notes
- The markdown-in-feed optimization was tested conceptually and then intentionally deferred.
- The main active profile screens already use a top-level list, so they are not the first place to spend effort compared with shared feed list tuning.
