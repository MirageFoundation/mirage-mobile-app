# Structural Refactor Plan

## Status
- Created: 2026-03-26
- Purpose: canonical plan for cleaning up app structure, routing, cache ownership, deep linking, and file modularity
- Current phase: Phase 5 in progress

---

## Executive Summary

The codebase already has most of the right building blocks:
- Expo Router
- `src/pages`
- `src/api`
- `src/hooks`
- `src/components/{atoms,molecules,ui/primitives}`
- TanStack Query
- Zustand

The problem is not missing tools. The problem is weak ownership boundaries.

Right now responsibilities are mixed across route files, page files, stores, providers, services, and cache logic. That leads to:
- oversized files
- duplicated navigation logic
- deep-link bugs
- inconsistent query/cache behavior
- overuse of `useEffect`
- poor modularity and weak maintainability

This plan is the source of truth for the cleanup.

---

## Target Architecture

```txt
app/
  _layout.tsx
  +native-intent.ts
  (auth)/
    _layout.tsx
    login.tsx
    recovery-phrase.tsx
    username.tsx
  (tabs)/
    _layout.tsx
    index.tsx
    following.tsx
    create.tsx
    inbox.tsx
    profile.tsx
  post/[id].tsx
  comment-compose.tsx
  ...

src/
  pages/
    auth/
      login-page.tsx
      recovery-phrase-page.tsx
      username-page.tsx
    post/
      post-detail-page.tsx
    comment/
      comment-compose-page.tsx
    home/
      home-page.tsx
      following-page.tsx
      home-post-list.tsx
      ...
    profile/
      profile-page.tsx
      user-profile-page.tsx
    ...

  api/
    client.ts
    query-keys.ts
    cache/
      posts-cache.ts
      comments-cache.ts
      users-cache.ts
      inbox-cache.ts
    read/
      endpoints/
      hooks/
    write/
      endpoints/
      hooks/

  hooks/
    auth/
    navigation/
    posts/
    comments/
    profile/
    topics/
    ui/

  navigation/
    route-map.ts
    linking.ts
    guarded-router.ts
    auth-navigation.ts

  domain/
    posts/types.ts
    comments/types.ts
    users/types.ts

  stores/
    auth-store.ts
    preferences-store.ts
    ui-store.ts
    draft-store.ts
    ...
```

---

## Non-Negotiable Architecture Rules

### Routing
1. `app/` contains route files, layout files, and route-level config only.
2. Route files should stay tiny. Prefer simple wrappers that import a page and export it.
3. Layout files should not contain feature business logic.
4. Deep-link mapping must be centralized in one navigation module.

### Pages and Modularity
5. `src/pages/` contains page containers and feature page composition.
6. Page files must be modular and small enough to reason about.
7. Hard target: keep new page/container files around **<= 300 lines** when possible.
8. Soft warning threshold: **> 400 lines** means split it.
9. Strong refactor threshold: **> 600 lines** is too large and must be broken up.
10. Split pages into:
   - page container
   - page sections
   - feature hooks
   - presentational components
   - cache helpers if needed

### Components
11. `primitives` are the styling/UI building blocks.
12. `atoms` are small reusable UI units.
13. `molecules` compose atoms/primitives into reusable feature UI pieces.
14. Component files should not own server cache policy.

### API and Hooks
15. API definitions stay centralized under `src/api`.
16. Pages and route files should not import endpoint functions directly.
17. Pages should consume centralized read hooks and write hooks.
18. Query keys must be centralized and reused everywhere.
19. Do not scatter raw literal query keys like `['posts']` across the app.
20. Mutation cache updates and optimistic updates should live in reusable cache helpers or mutation hooks, not in page files.

### TanStack Query
21. TanStack Query owns server state.
22. Zustand should not mirror server resources unless there is a very strong local-only reason.
23. Query identity must consider server/session scope when required.
24. Avoid brute-force `queryClient.clear()` as a normal flow control mechanism.
25. Prefer targeted invalidation and deterministic cache helpers.
26. Add `mutationKey` consistently for mutation observability and debugging.

### Zustand
27. Zustand is for client state only:
   - auth/session metadata
   - UI state
   - preferences
   - drafts
   - local-only persisted state
28. Stores must not depend on page modules.
29. Stores must not depend on component model types.
30. Stores must not perform broad query orchestration or prefetch flows unless explicitly justified and isolated.

### Effects and Performance
31. Avoid heavy `useEffect` orchestration.
32. Prefer:
   - derived state
   - event handlers
   - query `enabled`
   - query `select`
   - memoized selectors
33. Do not use effects to sync state that can be derived during render.
34. App-level listeners belong in providers/services only if they are truly app-global.

### Boundaries
35. `stores/` must not import from `pages/`.
36. `stores/` should avoid importing from `components/` for data types.
37. `services/` should not become alternate data-fetch layers that bypass query conventions.
38. `navigation/` should own route parsing and route/auth transition logic.
39. Domain types should live outside UI components.

### Safety / Maintainability
40. No new huge files.
41. No “temporary” giant files that become permanent.
42. Prefer small, composable modules over feature dumping grounds.
43. Every refactor should improve ownership clarity, not just move code around.
44. Add lint/boundary enforcement later so this structure does not regress.

---

## Main Findings from the Audit

### 1) Route files currently contain full implementations
Large files still live in `app/`:
- `app/post/[id].tsx`
- `app/comment-compose.tsx`
- `app/(auth)/username.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/recovery-phrase.tsx`

This violates the intended router/page separation.

### 2) Many page files are far too large
Hotspots include:
- `src/pages/create-screen.tsx`
- `src/pages/quests-screen.tsx`
- `src/pages/annotate-screen.tsx`
- `src/pages/search-screen.tsx`
- `src/pages/user-profile-screen.tsx`
- `src/pages/profile-screen.tsx`
- `src/pages/topic-feed-screen.tsx`
- `src/pages/saved-posts-screen.tsx`

### 3) Query exists, but usage is inconsistent
- Query is installed and actively used.
- Query persistence exists.
- Query hooks and endpoint modules exist.
- But many places bypass clean layering.

### 4) Cache ownership is muddy
- Some cache logic lives in query hooks.
- Some lives in page files.
- Some lives in services.
- Some lives in stores.
- Server switching currently relies too much on broad cache clearing.

### 5) Zustand boundaries are loose
- Zustand is definitely in use.
- But some stores know too much about queries/pages/UI model types.

### 6) Deep linking and navigation are fragmented
Logic is split across multiple files instead of one central navigation/linking system.

### 7) `useEffect` usage is too heavy
There is too much effect-based orchestration, which contributes to rerenders and timing bugs.

### 8) The project lacks structural guardrails
No meaningful enforcement currently protects these boundaries.

---

## Refactor Phases

## Phase 1 — Route/Page Separation
Goal: make `app/` a true routing layer.

### Tasks
- Move route implementations out of `app/` into `src/pages/`.
- Create thin wrappers in `app/`.
- Start with:
  - `app/(auth)/login.tsx`
  - `app/(auth)/username.tsx`
  - `app/(auth)/recovery-phrase.tsx`
  - `app/post/[id].tsx`
  - `app/comment-compose.tsx`
- Add page exports as needed.

### Success Criteria
- `app/` only holds wrappers/layouts.
- Page implementation lives in `src/pages/**`.
- No behavior change intended.

---

## Phase 2 — Navigation + Deep-Link Consolidation
Goal: one source of truth for route parsing and auth-aware navigation.

### Tasks
- Centralize route mapping.
- Unify deep-link parsing for native and internal links.
- Remove duplicate router guard logic.
- Eliminate timeout-based pending-route navigation where possible.

### Likely Targets
- `app/+native-intent.ts`
- `src/utils/internal-link-handler.ts`
- `src/hooks/use-router.ts`
- `src/utils/guarded-router.ts`
- `src/stores/deep-link-store.ts`
- `src/providers/root-provider.tsx`

---

## Phase 3 — Query Ownership and Cache Cleanup
Goal: TanStack Query becomes the single clean owner of server state.

### Tasks
- Centralize `queryKeys` usage everywhere.
- Replace raw literal keys with helper functions.
- Add `mutationKey` to write hooks.
- Create `src/api/cache/*` helpers for reusable optimistic updates.
- Remove page-level ad hoc cache mutation where possible.
- Revisit server-scoped cache identity.

---

## Phase 4 — Zustand Boundary Cleanup
Goal: make Zustand purely client-state oriented.

### Tasks
- Remove page imports from stores.
- Remove component type imports from stores where possible.
- Move server-derived concerns to Query.
- Trim auth-store responsibilities.

---

## Phase 5 — Break Up Giant Pages
Goal: replace page monoliths with modular feature structure.

### First targets
1. `src/pages/create-screen.tsx`
2. `src/pages/search-screen.tsx`
3. `src/pages/profile-screen.tsx`
4. `src/pages/user-profile-screen.tsx`
5. `src/pages/quests-screen.tsx`
6. `src/pages/topic-feed-screen.tsx`
7. `src/pages/annotate-screen.tsx`

### Pattern
Each giant page should be decomposed into:
- `*-page.tsx`
- `components/`
- `hooks/`
- `utils/`
- cache helpers if needed

---

## Phase 6 — Reduce Effect-Driven Flows
Goal: cut rerenders and timing bugs.

### Tasks
- Replace effect chains with declarative query options.
- Move lifecycle listeners out of pages where appropriate.
- Remove sync effects that only mirror derived state.
- Reduce app-level timers and delayed navigation patterns.

---

## Phase 7 — Guardrails and Regression Prevention
Goal: keep the architecture clean after the refactor.

### Tasks
- Add lint/import boundary rules.
- Add file-size reporting or thresholds.
- Add focused smoke tests for navigation/deep links.
- Document conventions in README or architecture docs.

---

## Immediate Order of Execution

1. Write this plan file.
2. Start Phase 1 route/page extraction.
3. Convert extracted `app/` files into thin wrappers.
4. Continue Phase 1 until major route implementations are out of `app/`.
5. Then move to Phase 2 navigation consolidation.

---

## Current Working Notes

### Phase 1 starting order
1. Auth routes
   - login
   - username
   - recovery phrase
2. Post route
3. Comment compose route

### Phase 1 progress
- [x] Extracted `app/(auth)/login.tsx` to `src/pages/auth/login-page.tsx`
- [x] Extracted `app/(auth)/username.tsx` to `src/pages/auth/username-page.tsx`
- [x] Extracted `app/(auth)/recovery-phrase.tsx` to `src/pages/auth/recovery-phrase-page.tsx`
- [x] Extracted `app/post/[id].tsx` to `src/pages/post/post-detail-page.tsx`
- [x] Extracted `app/comment-compose.tsx` to `src/pages/comment/comment-compose-page.tsx`
- [x] Converted the original `app/` files into thin wrappers
- [x] Extracted shared auth route UI into reusable components (`AuthRouteHeader`, `NodeSwitchModal`, `RegistrationUnavailableModal`)
- [x] Continued breaking up `src/pages/auth/login-page.tsx` by extracting the login form state, header/title/footer/error sections, and a shared auth server base-url hook reused by auth routes
- [x] Continued breaking up `src/pages/auth/username-page.tsx` by extracting registration/referral/server-switch orchestration into `use-username-registration.ts` and dedicated username form/footer/transaction modules
- [x] Split `src/pages/comment/comment-compose-page.tsx` into focused modules (`components/*`, `comment-compose-utils.ts`)
- [x] Continued breaking up `src/pages/comment/comment-compose-page.tsx` by extracting compose orchestration into `use-comment-compose.ts` and a dedicated text editor component
- [x] Started breaking up `src/pages/post/post-detail-page.tsx` by extracting header, sticky header, loading/empty states, and shared post-detail utilities
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting comment tree utilities and a dedicated comment list item component
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting overlay/sheet rendering into a dedicated `PostDetailOverlays` component
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting comment action/param builders into `post-detail-action-utils.ts`
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting moderation/report/delete orchestration into `use-post-detail-moderation.ts`
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting optimistic comment submit/edit + pending compose flow into `use-post-detail-comment-actions.ts`
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting the post-card/list header into `PostDetailListHeader`
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting sticky-header/scroll orchestration into `use-post-detail-scroll-state.ts`
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting sync/cache/focus orchestration into `use-post-detail-sync.ts`
- [x] Continued breaking up `src/pages/post/post-detail-page.tsx` by extracting screen orchestration, overlay state, and list rendering into `use-post-detail-screen.ts`, `use-post-detail-overlays.ts`, and `PostDetailCommentsList`
- [x] Started breaking up `src/pages/create-screen.tsx` by extracting the create header and video preview into dedicated create-screen modules
- [x] Continued breaking up `src/pages/create-screen.tsx` by extracting link, editability, content-warning, media toolbar, sticker/image preview, processing overlays, post-meta section, and video upload state into dedicated create-screen modules/hooks
- [x] Continued breaking up `src/pages/create-screen.tsx` by extracting submission flow, intake/share-intent sync, and media interaction logic into dedicated create hooks
- [x] Completed search feature modularization by extracting header, tabs, list items, empty states, and search utilities into `src/pages/search/*`
- [x] Completed profile feature modularization by extracting list items, footer, overlays, and post-action helpers into `src/pages/profile/*`
- [x] Continue splitting the extracted page implementations into smaller feature modules

### Phase 2 progress
- [x] Centralized Mirage route parsing into `src/navigation/route-map.ts`
- [x] Centralized guarded router exports into `src/navigation/guarded-router.ts`
- [x] Centralized auth-aware route deferral + pending-route flushing into `src/navigation/auth-navigation.ts`
- [x] Centralized deep-link handling for native intents and in-app links into `src/navigation/linking.ts`
- [x] Repointed `app/+native-intent.ts`, `src/utils/internal-link-handler.ts`, `src/hooks/use-router.ts`, and `src/utils/guarded-router.ts` to the shared navigation modules
- [x] Replaced timeout-based pending-route navigation in `src/providers/root-provider.tsx` with shared pending-route flushing via `requestAnimationFrame`
- [x] Repointed additional shared callers (headers, markdown/comment link handling, auth guard, post/auth/comment hooks, inbox notifications, and create flows) to the canonical `src/navigation/*` modules
- [x] Finished consolidating remaining navigation callers onto the new `src/navigation/*` modules; legacy wrapper imports are no longer referenced in app code

### Phase 3 progress
- [x] Added reusable post cache helpers in `src/api/cache/posts-cache.ts` for edited-post fanout and root-post metadata sync
- [x] Added query-key prefix helpers (`postsRoot`, `commentsRoot`, `userPostsRoot`) to reduce scattered literal key prefixes
- [x] Replaced ad hoc edited-post cache fanout in `src/pages/create/use-create-submit.ts` with shared cache helpers
- [x] Replaced post-detail feed metadata sync in `src/pages/post/use-post-detail-sync.ts` with shared cache helpers and centralized key prefixes
- [x] Replaced a first batch of raw user-post/user-blocked invalidation keys in profile screens with `queryKeys` helpers
- [x] Replaced another batch of raw post/comment/topic query-key prefixes in write hooks (`use-vote`, `use-award`, `use-post`, `use-block`, `use-follow`) with centralized root helpers
- [x] Reduced one broad cache-clearing flow in `src/pages/logged-out-home.tsx` to targeted query removal/refetch for node/config/welcome stats
- [x] Added centralized mutation keys in `src/api/write/mutation-keys.ts` and wired all write hooks to use `mutationKey`
- [x] Replaced the remaining raw query-key hotspots (`use-annotate`, `use-set-agents`, `use-username-resolution`, `use-server-list`, `agents-screen`) with centralized helpers
- [x] Replaced normal-flow broad query clearing in `src/pages/auth/login-page.tsx` and `src/providers/api-server-provider.tsx` with targeted server-scoped cache clearing via `src/api/cache/server-cache.ts`
- [x] Continue replacing remaining raw query keys and broad cache-clearing flows as Phase 3 continues

### Phase 4 progress
- [x] Moved canonical home post-card store ownership from `src/pages/home/home-post-card-store.ts` to `src/stores/home-post-card-store.ts`
- [x] Repointed app imports to the canonical store module so stores no longer depend on page modules
- [x] Moved canonical post/comment/content-warning types into `src/domain/{posts,comments,content}/types.ts`
- [x] Updated store consumers (`auth-store`, `history-store`, `saved-posts-store`) to depend on domain/store-safe modules instead of UI component model types
- [x] Removed server/query orchestration from `src/stores/auth-store.ts`
- [x] Moved auth hydration fetch logic into `src/providers/wallet-provider.tsx` so Zustand remains client-state focused
- [x] Verified `src/stores/*` no longer import from `pages/` or `components/`

### Phase 5 progress
- [x] Continued breaking up `src/pages/user-profile-screen.tsx` by extracting list-item wrappers, viewability orchestration, footer rendering, and shared user-profile utilities into `src/pages/user-profile/*`
- [x] Continued breaking up `src/pages/topic-feed-screen.tsx` by extracting the topic header and overlay/sheet rendering into `src/pages/topic-feed/*`
- [x] Continued breaking up `src/pages/saved-posts-screen.tsx` by extracting the tab bar, saved-comment/media rendering, empty state, and saved-posts viewability orchestration into `src/pages/saved/*`
- [x] Continued breaking up `src/pages/quests-screen.tsx` by extracting quest cards, countdowns, loading/empty states, and claim-success UI into `src/pages/quests/*`
- [x] Continued breaking up `src/pages/annotate-screen.tsx` by extracting annotate header, post summary, tag modal, media section, and basic override sections into `src/pages/annotate/*`
- [ ] Continue follow-on cleanup for remaining still-large screens (`user-profile-screen`, `topic-feed-screen`, `saved-posts-screen`, `annotate-screen`) as needed

### Do not do during Phase 1
- No logic rewrite unless necessary.
- No behavior changes unless required to preserve routing correctness.
- No large API/caching redesign yet.

Phase 1 is about ownership and file placement first.
