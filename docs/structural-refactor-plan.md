# Structural Refactor Plan

## Status
- Created: 2026-03-26
- Refreshed for current codebase: 2026-05-18
- Purpose: canonical plan for cleaning up app structure, routing, cache ownership, store boundaries, effects, and file modularity.
- Current phase: Phases 1 and 2 are complete. Next phase is Phase 3 query/cache ownership cleanup.
- Dependency policy: this plan is for clean refactor only. Do **not** combine it with Expo/RN/video/native dependency upgrades.

---

## Executive Summary

The current app has the right broad stack:
- Expo Router
- `src/pages`
- `src/api/read` and `src/api/write`
- TanStack Query
- Zustand
- `src/navigation` for route parsing/linking pieces
- reusable UI under `src/components`

The current issue is still ownership and file size, not missing libraries. Phase 1 fixed the largest routing mismatch by making `app/` routing-only again. The remaining cleanup should now move through navigation, cache/store, page modularity, and effect cleanup.

Treat the previous “Phase 6 ready / Phases 1-5 complete” status as stale. The current refactor restarted from the actual tree and Phase 1 is now complete.

---

## Non-Goals / Dependency Freeze

This refactor must avoid dependency churn unless a separate task explicitly asks for it.

Do not do these as part of the structural refactor:
- Upgrade Expo SDK, React Native, React, or navigation packages.
- Replace or upgrade video libraries.
- Change native video processing packages such as `react-native-video-trim`, `react-native-vision-camera`, `expo-av`, or `expo-video-thumbnails`.
- Switch media/video architecture while splitting files.
- Change PoW native module behavior or release a native module.
- Add new dependencies just to make refactoring easier.

Dependency-related docs found during review:
- `docs/POW_NATIVE_MODULE_PLAN.md` proposes `react-native-argon2-turbo` as a native-module/performance migration. That is not part of this clean refactor.
- `docs/pow-v1.11.0-upgrade-plan.md` mentions possible native `react-native-argon2-turbo` changes for target-based PoW. That is not part of this clean refactor.
- `docs/fdroid-build-handoff.md` notes prior native dependency upgrades for `react-native-unistyles` and `react-native-nitro-modules`. That is historical, not a new refactor task.
- No doc reviewed requires a video dependency upgrade for this cleanup.

---

## Target Architecture

```txt
app/
  _layout.tsx                 # app shell/layout only
  +native-intent.ts            # delegates to src/navigation/linking
  (auth)/
    _layout.tsx
    login.tsx                  # thin wrapper
    recovery-phrase.tsx        # thin wrapper
    username.tsx               # thin wrapper
  (tabs)/
    _layout.tsx                # tab layout only; minimize feature logic
    index.tsx                  # thin wrapper
    following.tsx              # thin wrapper
    create.tsx                 # thin wrapper
    inbox.tsx                  # thin wrapper
    profile.tsx                # thin wrapper
  post/[id].tsx                # thin wrapper
  comment-compose.tsx          # thin wrapper
  ...

src/
  pages/
    auth/
      login-page.tsx
      recovery-phrase-page.tsx
      username-page.tsx
      components/
      hooks/
    post/
      post-detail-page.tsx
      media-post-detail-page.tsx
      components/
      hooks/
      utils/
    comment/
      comment-compose-page.tsx
      components/
      hooks/
      utils/
    create/
      create-page.tsx
      components/
      hooks/
      utils/
    home/
      home-page.tsx
      following-page.tsx
      components/
      hooks/
      utils/
    ...

  api/
    read/
      endpoints/
      hooks/
      query-keys.ts
    write/
      endpoints/
      hooks/
      mutation-keys.ts
    cache/
      posts-cache.ts
      comments-cache.ts
      users-cache.ts
      server-cache.ts

  domain/
    posts/types.ts
    comments/types.ts
    content/types.ts
    users/types.ts

  navigation/
    route-map.ts
    linking.ts
    guarded-router.ts
    auth-navigation.ts

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
2. Route files should be tiny wrappers that import from `src/pages/*`.
3. Layout files may compose providers/navigation chrome, but should not own feature business logic.
4. Deep-link mapping and route parsing belong in `src/navigation/*`.

### Pages and Modularity
5. `src/pages/` owns page containers and feature page composition.
6. Keep new page/container files near **300 lines** when practical.
7. Soft warning: **> 400 lines**.
8. Strong refactor target: **> 600 lines**.
9. Split large pages into page containers, feature hooks, presentational sections, utilities, and cache helpers.

### API, Query, and Cache
10. TanStack Query owns server state.
11. Query keys must come from `src/api/read/query-keys.ts` or centralized prefix helpers.
12. Avoid raw literal query keys such as `["posts"]` in pages/hooks.
13. Write hooks should use centralized `mutationKey`s.
14. Reusable optimistic updates/cache fanout should live under `src/api/cache/*`.
15. Avoid `queryClient.clear()` in normal flows; prefer targeted removal/invalidation.

### Stores and Domain Types
16. Zustand is for client/local state only: auth/session metadata, UI state, preferences, drafts, and local-only persisted state.
17. Stores must not import from `src/pages/*`.
18. Stores should not import model types from `src/components/*`; use `src/domain/*` types instead.
19. Stores should not orchestrate server fetches, query invalidation, or feature/page flows.

### Effects and Performance
20. Avoid effect-heavy orchestration.
21. Prefer derived state, event handlers, query `enabled`, query `select`, memoized selectors, and focused hooks.
22. Do not use effects to mirror state that can be derived during render.
23. App-global listeners belong in providers/services only when truly app-global.

### Safety
24. No broad rewrites without a clear owner/boundary improvement.
25. No new giant files.
26. No dependency upgrades during structural cleanup.
27. Preserve behavior first; refactor in small, reviewable steps.

---

## Current Codebase Snapshot

Generated from the current repo on 2026-05-18.

### `app/` routing boundary status

Phase 1 is complete. `app/` now contains route wrappers, route/layout config, `+native-intent` delegation, and `+not-found` only.

Largest remaining `app/` files:

| File | Current size | Status |
| --- | ---: | --- |
| `app/(auth)/_layout.tsx` | 18 lines | route/layout config |
| `app/(tabs)/_layout.tsx` | 5 lines | wrapper plus `unstable_settings` |
| standard route wrappers | 1-6 lines | delegate to `src/pages/*` or `src/navigation/*` |

Moved implementation modules:
- `app/(auth)/login.tsx` → `src/pages/auth/login-page.tsx`
- `app/(auth)/recovery-phrase.tsx` → `src/pages/auth/recovery-phrase-page.tsx`
- `app/(auth)/username.tsx` → `src/pages/auth/username-page.tsx`
- `app/comment-compose.tsx` → `src/pages/comment/comment-compose-page.tsx`
- `app/post/[id].tsx` → `src/pages/post/post-detail-page.tsx`
- `app/saved-posts.tsx` route error-boundary UI → `src/pages/saved/saved-posts-route.tsx`
- `app/(tabs)/_layout.tsx` implementation → `src/navigation/tab-layout.tsx`
- `app/_layout.tsx` implementation → `src/navigation/root-layout.tsx`

### Largest `src/pages` files

Files over the 600-line strong refactor target:

| File | Lines |
| --- | ---: |
| `src/pages/create-screen.tsx` | 3300 |
| `src/pages/post/media-post-detail-screen.tsx` | 3149 |
| `src/pages/quests-screen.tsx` | 1688 |
| `src/pages/annotate-screen.tsx` | 1536 |
| `src/pages/search-screen.tsx` | 1528 |
| `src/pages/user-profile-screen.tsx` | 1484 |
| `src/pages/profile-screen.tsx` | 1309 |
| `src/pages/topic-feed-screen.tsx` | 1128 |
| `src/pages/saved-posts-screen.tsx` | 1108 |
| `src/pages/home-screen.tsx` | 983 |
| `src/pages/user-following-screen.tsx` | 865 |
| `src/pages/home/home-tabbed-feed.tsx` | 810 |
| `src/pages/invite-and-earn-screen.tsx` | 792 |
| `src/pages/change-username-screen.tsx` | 785 |
| `src/pages/settings-screen.tsx` | 758 |
| `src/pages/logged-out-home.tsx` | 719 |
| `src/pages/agents-screen.tsx` | 713 |
| `src/pages/blocked-list-screen.tsx` | 667 |
| `src/pages/following-screen.tsx` | 626 |
| `src/pages/create/video-editor-screen.tsx` | 600 |

### Component and service hotspots

These are not first priority while `app/` still has full screens, but they are known cleanup targets:

| File | Lines |
| --- | ---: |
| `src/components/molecules/post-card-media.tsx` | 1845 |
| `src/services/inbox-notifications.ts` | 1382 |
| `src/components/molecules/side-menu.tsx` | 999 |
| `src/components/molecules/comment-item.tsx` | 957 |
| `src/components/molecules/media-preview-modal.tsx` | 949 |
| `src/components/molecules/profile-about-tab.tsx` | 940 |
| `src/services/pow-queue.ts` | 798 |
| `src/components/ui/primitives/box.tsx` | 734 |
| `src/components/molecules/media-gallery.tsx` | 688 |
| `src/components/molecules/post-options-sheet.tsx` | 668 |

### Query/cache findings

Current issues to clean up after route extraction:
- `src/api/read/query-keys.ts` exists and is used, but raw query keys remain in write hooks and page files.
- `src/api/cache/*` does not currently exist.
- `src/api/write/mutation-keys.ts` does not currently exist.
- Broad `queryClient.clear()` still appears in normal flows, including:
  - `src/providers/api-server-provider.tsx`
  - `src/providers/query-clear-provider.tsx`
  - `src/pages/logged-out-home.tsx`
  - `src/components/ui/dev-toolbar.tsx` (acceptable only as dev tooling)

### Store boundary findings

Current store imports that violate the intended boundary:
- `src/stores/auth-store.ts` imports from `@/src/pages/home/home-post-card-store`.
- `src/stores/post-comment-optimistic-store.ts` imports from `@/src/components/molecules`.
- `src/stores/history-store.ts` imports from `@/src/components/molecules/post-card-types`.
- `src/stores/saved-posts-store.ts` imports from `@/src/components/molecules/post-card-types` and `@/src/components/molecules/comment-item`.

### Navigation findings

Current good pieces:
- `app/+native-intent.ts` delegates to `src/navigation/linking`.
- `src/navigation/route-map.ts`, `src/navigation/linking.ts`, `src/navigation/auth-navigation.ts`, `src/navigation/guarded-router.ts`, and `src/navigation/auth-invite-linking.ts` exist.
- `src/hooks/use-router.ts`, `src/utils/guarded-router.ts`, and `src/utils/internal-link-handler.ts` are compatibility re-exports.
- Direct `expo-router` router imports are removed outside `src/navigation/*`; remaining direct imports are route config/layout APIs, route param hooks, or types.

Current gaps:
- Navigation guardrails are still manual until Phase 8 adds checks.

### Effect-heavy hotspots

Most `useEffect` occurrences are in the same large screens that need extraction first:
- `app/post/[id].tsx` — 25
- `src/pages/post/media-post-detail-screen.tsx` — 15
- `src/pages/home-screen.tsx` — 13
- `src/pages/quests-screen.tsx` — 13
- `src/components/molecules/post-card-media.tsx` — 12
- `src/pages/create-screen.tsx` — 10
- `app/comment-compose.tsx` — 9
- `src/pages/topic-feed-screen.tsx` — 9
- `src/pages/following-screen.tsx` — 8

Do not start by deleting effects blindly. Extract ownership first, then replace synchronization effects with derived state/query options where safe.

---

## Refactor Phases for Current Codebase

## Phase 0 — Align Docs and Guardrails

Goal: make the plan and future checks reflect the current tree.

### Tasks
- Replace stale completion claims with current audit data.
- Keep dependency upgrades explicitly out of scope.
- Add or restore guardrail scripts after the plan is updated:
  - file-size report
  - store-boundary check
  - raw query-key literal check
  - navigation/deep-link smoke check
- Add `package.json` scripts for the checks once the tools exist.

### Success Criteria
- Docs no longer claim completed extractions that are absent from the repo.
- Agents know not to start with dependency/video upgrades.
- Verification commands match actual scripts.

---

## Phase 1 — Route/Page Separation

Goal: make `app/` a true routing layer.

Status: **complete**.

### Order
1. [x] Extract `app/(auth)/login.tsx` to `src/pages/auth/login-page.tsx`.
2. [x] Extract `app/(auth)/recovery-phrase.tsx` to `src/pages/auth/recovery-phrase-page.tsx`.
3. [x] Extract `app/(auth)/username.tsx` to `src/pages/auth/username-page.tsx`.
4. [x] Extract `app/comment-compose.tsx` to `src/pages/comment/comment-compose-page.tsx`.
5. [x] Extract `app/post/[id].tsx` to `src/pages/post/post-detail-page.tsx`.
6. [x] Review and extract `app/(tabs)/_layout.tsx` and `app/_layout.tsx` implementation into `src/navigation/*` modules.
7. [x] Extract `app/saved-posts.tsx` route error-boundary UI to `src/pages/saved/saved-posts-route.tsx`.

### Rules
- Preserve behavior.
- Prefer move/extract over rewrite.
- After extraction, `app/*` files should only import and export page modules or configure layout metadata.
- If a moved page is still huge, accept that temporarily; split it in Phase 4.

### Success Criteria
- No route implementation over ~100 lines unless it is a layout with clear routing-only responsibility.
- Auth, post detail, and comment compose implementations live in `src/pages/*`.

---

## Phase 2 — Navigation Boundary Cleanup

Goal: put route parsing, guarded navigation, and auth-aware route deferral under `src/navigation/*`.

Status: **complete**.

### Tasks
- [x] Move guarded router implementation from `src/utils/guarded-router.ts` to `src/navigation/guarded-router.ts`.
- [x] Keep legacy utility wrapper as a thin re-export for incremental migration.
- [x] Repoint current guarded-router callers to `src/navigation/guarded-router.ts`.
- [x] Move guarded `useRouter` hook implementation into `src/navigation/guarded-router.ts`.
- [x] Keep `src/hooks/use-router.ts` as a thin compatibility re-export.
- [x] Repoint current `useRouter` callers to `src/navigation/guarded-router.ts`.
- [x] Audit direct imports of `expo-router` from page files.
- [x] Remove direct `router` imports from `expo-router` outside navigation modules.
- [x] Keep native intent and in-app link parsing delegated to `src/navigation/linking.ts`.
- [x] Move auth invite/ref URL listener and parsing into `src/navigation/auth-invite-linking.ts`.

### Success Criteria
- Navigation behavior has one canonical home under `src/navigation/*`.
- Page files do not create new deep-link parsing or route-guard logic.

---

## Phase 3 — Query Ownership and Cache Cleanup

Goal: TanStack Query owns server state with centralized keys and reusable cache helpers.

### Tasks
- Create `src/api/write/mutation-keys.ts`.
- Add `mutationKey` to write hooks.
- Create `src/api/cache/*` helpers for repeated post/comment/user cache fanout.
- Replace raw query keys in high-churn files first:
  - `src/api/write/hooks/use-post.ts`
  - `src/api/write/hooks/use-vote.ts`
  - `src/api/write/hooks/use-award.ts`
  - `src/api/write/hooks/use-block.ts`
  - `src/api/write/hooks/use-follow.ts`
  - `src/pages/create-screen.tsx`
  - `src/pages/change-username-screen.tsx`
- Replace normal-flow `queryClient.clear()` with targeted invalidation/removal.

### Success Criteria
- Query key literals are centralized or isolated behind approved helpers.
- Mutation observability is improved with `mutationKey`s.
- No broad cache clearing in normal app flows.

---

## Phase 4 — Store and Domain Boundary Cleanup

Goal: keep Zustand client-state-only and remove UI/page type coupling.

### Tasks
- Move `src/pages/home/home-post-card-store.ts` into `src/stores/home-post-card-store.ts` or rename it so `auth-store` no longer imports from pages.
- Move reusable post/comment/content types from components into `src/domain/*`.
- Repoint `history-store`, `saved-posts-store`, and `post-comment-optimistic-store` away from component modules.
- Audit `auth-store.ts` for server/query orchestration and split it out if present.

### Success Criteria
- `src/stores/*` imports nothing from `src/pages/*` or `src/components/*`.
- Store types come from `src/domain/*` or local store-safe modules.

---

## Phase 5 — Break Up Giant Pages

Goal: replace page monoliths with modular feature structure.

### Priority order
1. `src/pages/create-screen.tsx`
2. `src/pages/post/media-post-detail-screen.tsx`
3. `src/pages/quests-screen.tsx`
4. `src/pages/annotate-screen.tsx`
5. `src/pages/search-screen.tsx`
6. `src/pages/user-profile-screen.tsx`
7. `src/pages/profile-screen.tsx`
8. `src/pages/topic-feed-screen.tsx`
9. `src/pages/saved-posts-screen.tsx`
10. `src/pages/home-screen.tsx` and `src/pages/following-screen.tsx`

### Extraction pattern
For each feature, create a folder such as `src/pages/create/` with:
- a page container
- `components/`
- `hooks/`
- `utils/`
- optional feature-local types

Move cache mutation to `src/api/cache/*`, not feature folders, when the helper is reusable.

### Success Criteria
- No page/container file remains over 600 lines without a documented reason.
- New or touched page files trend toward 300-400 lines.
- Behavior remains stable after each extraction.

---

## Phase 6 — Component and Service Hotspot Cleanup

Goal: reduce secondary monoliths once route/page ownership is sane.

### Tasks
- Split `src/components/molecules/post-card-media.tsx` into media-type renderers and media state hooks.
- Split `src/services/inbox-notifications.ts` into parsing, permission, scheduling, and sync modules.
- Split large sheets/modals by section where it improves readability.
- Keep component files out of server cache policy.

### Success Criteria
- Large components become composable, testable modules.
- Services have clear single-purpose modules.

---

## Phase 7 — Reduce Effect-Driven Flows

Goal: cut rerenders and timing bugs after ownership boundaries are clear.

### Tasks
- Replace effect chains with derived state and query options.
- Move app-global listeners into providers/services only when they are truly global.
- Remove effects that mirror query/store state into duplicate local state.
- Replace timer/delayed navigation patterns with centralized navigation helpers.

### Success Criteria
- High-effect hotspots shrink naturally as pages/components are split.
- Remaining effects have clear external side effects or subscriptions.

---

## Phase 8 — Regression Guardrails

Goal: prevent the architecture from drifting back.

### Tasks
- Add file-size reporting under `tools/`.
- Add store-boundary checks.
- Add raw query-key literal checks.
- Add navigation/deep-link smoke checks.
- Add package scripts, using Bun:
  - `bun run check:file-sizes`
  - `bun run check:stores`
  - `bun run check:query-keys`
  - `bun run check:navigation`
  - `bun run check:architecture`

### Success Criteria
- Guardrail commands exist and run in CI/local workflows.
- Docs and `package.json` commands match the actual tools.

---

## Immediate Next Actions

1. Start Phase 3 by creating `src/api/write/mutation-keys.ts`.
2. Add `mutationKey` to write hooks in small batches.
3. Add `src/api/cache/*` helpers for repeated post/comment/user cache fanout.
4. Replace normal-flow `queryClient.clear()` with targeted invalidation/removal.
5. Do not touch video/native dependencies while doing this cleanup.

---

## Current Verification Reality

Current `package.json` scripts:
- `bun run lint`

The old docs referenced guardrail scripts under `tools/`, but those files are not present in this version of the repo. Add them in Phase 8 before relying on commands like `check:file-sizes` or `check:architecture`.
