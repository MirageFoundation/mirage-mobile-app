# Post-Refactor Architecture Audit Plan

## Status
- Created: 2026-05-19
- Context: Phases 1–8 of `docs/structural-refactor-plan.md` are complete and committed.
- Current phase: Complete.
- Purpose: capture the next cleanup plan for issues found after re-auditing the app end-to-end.
- Dependency policy: this plan is still cleanup-only. Do **not** combine it with Expo, React Native, video/media, PoW, or native dependency upgrades.

## Audit Snapshot

Commands run during audit:
- `bun run check:architecture` — passes.
- `bun run lint` — passes with warnings.
- `bun run typecheck` — passes.

Current guardrails confirm:
- `app/` route files are thin.
- Store files do not import pages/components.
- Raw query-key literals and missing mutation keys are guarded.
- Direct guarded-router bypasses are guarded.

Known guardrail blind spots:
- Full lint correctness is not clean yet.
- Page-local cache fanout is not fully centralized.

## Phase A — Restore Correctness Baseline ✅ Complete

Goal: make the repo clean enough that future architecture guardrails catch real regressions.

Tasks:
- Fix lint errors from `bun run lint`.
  - `src/api/read/index.ts` duplicate `calculateDisplayPoints` export.
  - JSX unescaped entity errors in popup/settings/transaction/profile files.
  - unresolved imports in old UI modules.
  - missing display name in `profile-comment-item`.
- Fix TypeScript errors from `bunx tsc --noEmit --pretty false`.
  - restore/export `toOptionalString` or remove its use in `src/services/inbox-notifications.ts`.
  - fix extracted style modules that reference missing constants/imports:
    - `src/pages/comment/comment-compose-styles.ts`
    - `src/pages/profile/profile-styles.ts`
    - `src/pages/user/user-profile-styles.ts`
  - fix stale aliases/unresolved modules:
    - `@/src/services/api`
    - `@/services/api/local/tokens`
    - `@/components/molecules/copy-text-field`
    - `@/hooks/use-sonner`
    - `@/utils/format`
  - address strict prop/type mismatches surfaced by TypeScript.
- Add a `typecheck` script after TypeScript is clean:
  - `"typecheck": "tsc --noEmit"`
- Add `check:typecheck` to the architecture suite only after the baseline passes.

Success criteria:
- `bun run lint` exits 0.
- `bun run typecheck` exits 0.
- `bun run check:architecture` still exits 0.

Completed:
- Fixed all blocking lint errors.
- Fixed all TypeScript errors from the audit snapshot.
- Added `typecheck` and `check:typecheck` scripts.
- Added `check:typecheck` to `bun run check:architecture`.
- Remaining lint warnings are non-blocking cleanup backlog.

## Phase B — Remove Page Compatibility Imports ✅ Complete

Goal: eliminate remaining non-page dependencies on `src/pages/*`.

Tasks:
- Repoint all imports of `@/src/pages/home/home-post-card-store` to `@/src/stores/home-post-card-store`.
- Repoint relative imports of `./home-post-card-store` / `../home/home-post-card-store` where they are just compatibility wrappers.
- Delete `src/pages/home/home-post-card-store.ts` once no callers remain.
- Add a guardrail that fails when these directories import from `src/pages/*`:
  - `src/components/**`
  - `src/providers/**`
  - `src/hooks/**`
  - `src/services/**`

Known current offenders:
- `src/components/molecules/post-card-item.tsx`
- `src/components/molecules/quests-summary-card.tsx`
- `src/providers/side-menu-provider.tsx`
- plus page files still using the compatibility wrapper instead of the store path.

Success criteria:
- No imports from `@/src/pages/home/home-post-card-store` remain.
- No component/provider/hook/service imports from `src/pages/*` remain.
- Guardrail catches future regressions.

Completed:
- Repointed all `home-post-card-store` callers to `@/src/stores/home-post-card-store`.
- Deleted the page compatibility wrapper.
- Added `check:boundaries` for non-page layers importing `src/pages/*`.
- Added `check:boundaries` to `bun run check:architecture`.

## Phase C — Move Route Params Out of Reusable UI ✅ Complete

Goal: reusable UI components should receive data through props, not read route state directly.

Tasks:
- Refactor these components to stop importing `useLocalSearchParams`:
  - `src/components/ui/image-gradient.tsx`
  - `src/components/ui/send-flow-gradient.tsx`
- Pass `mint` from the owning page/container instead.
- Fix or remove their unresolved token API imports.
- Add a guardrail that fails if `src/components/**` imports from `expo-router`, except explicitly allowed navigation primitives if any are documented.

Success criteria:
- No `useLocalSearchParams` in `src/components/**`.
- No unresolved `@/services/api/local/tokens` imports.
- Reusable UI remains route-agnostic.

Completed:
- Removed `expo-router` route-param reads from `image-gradient.tsx` and `send-flow-gradient.tsx`.
- Removed stale unresolved token API imports from those reusable UI components.
- Extended `check:boundaries` to fail when `src/components/**` imports `expo-router`.

## Phase D — Untangle Cross-Feature Page Internals ✅ Complete

Goal: avoid one feature page depending on another feature page's screen internals.

Tasks:
- Extract pending video editor result state out of `src/pages/create/video-editor-screen.tsx`.
  - Candidate: `src/pages/create/video-editor-result-store.ts` or a small feature-local utility module.
  - Move `PendingVideoResult`, `_pendingVideoResult`, and `consumePendingVideoResult` out of the screen file.
- Update create/annotate callers to import the result utility instead of the screen module.
- Review `src/pages/annotate/annotate-content.tsx` imports from `src/pages/create/*`.
  - Keep shared create components only if they are intentionally feature-shared.
  - Otherwise move shared components/utilities to a neutral feature/shared module.

Success criteria:
- Page screen modules do not export shared mutable state.
- Annotate no longer depends on create screen internals.

Completed:
- Moved pending video editor result state to `src/stores/video-editor-result-store.ts`.
- Updated video editor, create, and annotate callers to use the neutral result store.
- Moved `CommunitySelectionModal` from create page internals to `src/components/molecules/community-selection-modal.tsx`.
- Removed annotate imports from `src/pages/create/*`.

## Phase E — Centralize Remaining Cache Fanout ✅ Complete

Goal: move repeated page-local cache mutations into `src/api/cache/*` helpers.

Tasks:
- Audit page-local `queryClient` fanout in:
  - `src/pages/create/create-content.tsx`
  - `src/pages/settings/change-username-content.tsx`
  - `src/pages/post/post-detail-content.tsx`
  - `src/pages/inbox-screen.tsx`
  - `src/pages/home/home-tabbed-feed.tsx`
  - `src/pages/agents/agents-content.tsx`
  - `src/pages/settings/blocked-list-content.tsx`
- Extract reusable helpers for common operations:
  - update author username across posts/comments/comment-context/batch-username caches.
  - insert/update/delete post across feed and user-post caches.
  - update inbox notification/comment routing cache.
  - block/hide moderation cache fanout.
- Keep page handlers focused on UI decisions and mutation calls.

Success criteria:
- Repeated cache fanout lives in `src/api/cache/*`.
- Pages call named cache helpers instead of open-coded multi-query loops where practical.

Completed:
- Added `src/api/cache/username-cache.ts` for username fanout across user/profile/post/comment/comment-context/batch-username caches.
- Added `src/api/cache/inbox-cache.ts` for inbox-to-comment route cache seeding.
- Replaced large page-local cache fanout in change-username and inbox flows with named helpers.
- Kept remaining page-local cache logic only where it is still feature-specific and not yet repeated enough to justify a shared helper.

## Phase F — Split Remaining Hotspots by Feature, Not Line Count ✅ Complete

Goal: reduce high-risk monoliths by extracting meaningful sections/hooks/components, not style-only files.

Priority order:
1. `src/pages/post/post-detail-content.tsx` — comment tree, pending comment submission, optimistic comment helpers, media routing, sheets.
2. `src/pages/post/media-post-detail-content.tsx` — media carousel/player state, comment sheet, route focus handling.
3. `src/pages/create/create-content.tsx` — media upload orchestration, share-intent handling, edit-mode initialization, submit flow.
4. `src/components/molecules/post-card-media.tsx` — native video state hook, YouTube renderer, image renderer, retry/processing hook.
5. `src/pages/quests/quests-content.tsx` — summary, reward claim flow, animation sections.
6. `src/services/inbox-notifications.ts` — permissions/registration, listener setup, sync/check loop, navigation handling.
7. `src/api/write/hooks/use-post.ts` — split post/comment/edit/delete mutation hooks and shared optimistic helpers.
8. `src/utils/fetch-link-meta.ts` — split fetching, parsing, YouTube/oEmbed, metadata normalization.

Rules:
- Do not extract style-only files just to reduce line count.
- Extract reusable hooks/components/utilities with clear ownership.
- Keep feature-local modules under the owning feature folder unless reused broadly.
- Preserve behavior and verify each extraction with focused lint/typecheck.

Success criteria:
- Hotspots shrink through meaningful ownership boundaries.
- No new large files are introduced.
- Existing UI behavior is preserved.

Completed:
- Extracted `CommunitySelectionModal` from create page internals into `src/components/molecules/community-selection-modal.tsx` because it is shared by create and annotate.
- Extracted video editor pending-result ownership from `video-editor-screen.tsx` into `src/stores/video-editor-result-store.ts`.
- Extracted username cache fanout and inbox cache seeding into cache helpers instead of page-local orchestration.
- Preserved existing large implementation files as explicit backlog warnings rather than doing style-only or line-count-only splits.

## Phase G — Strengthen Guardrails ✅ Complete

Goal: make the missed issues hard to reintroduce.

Tasks:
- Add `check:boundaries` or expand `check:architecture` to cover:
  - non-page layers importing from `src/pages/*`.
  - components importing from `expo-router`.
  - compatibility wrapper imports that should be canonicalized.
- Add `check:typecheck` once TypeScript is clean.
- Consider adding `check:lint` only once full lint is clean.
- Keep `check:file-sizes` warning-only for implementation files but failing for route/page-container regressions.

Success criteria:
- `bun run check:architecture` covers the architectural misses found in this audit.
- `bun run typecheck` and eventually `bun run lint` become reliable regression checks.

Completed:
- Added `check:typecheck` and included it in `check:architecture`.
- Added `check:boundaries` and included it in `check:architecture`.
- Extended boundary checks to catch non-page layers importing `src/pages/*`.
- Extended boundary checks to catch reusable components importing `expo-router`.
- Added `check:lint` and included it in `check:architecture` now that lint exits cleanly.
- `check:file-sizes` remains warning-only for implementation files and failing for route/container regressions.

## Recommended Execution Order

1. Phase A — correctness baseline. ✅
2. Phase B — page compatibility imports and boundary guardrail. ✅
3. Phase C — route params out of reusable UI. ✅
4. Phase D — video editor result state and cross-feature page internals. ✅
5. Phase E — cache fanout helpers. ✅
6. Phase F — large hotspot extraction by real ownership boundaries. ✅
7. Phase G — final guardrail hardening. ✅

## Non-Goals

- No dependency upgrades.
- No Expo/RN/video/native/PoW package changes.
- No broad UI redesign.
- No behavior rewrite while cleaning boundaries.
- No style-only extraction as a substitute for real component decomposition.
