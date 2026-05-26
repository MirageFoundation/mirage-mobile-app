# Large File Breakup Plan

## Status
- Created: 2026-05-19
- Branch: `chore/large-file-breakup`
- Base: stacked on PR #35 (`chore/refactor-from-prod`)
- Goal: split remaining large implementation hotspots by real ownership boundaries, not by moving styles or chasing line counts.
- Dependency policy: no dependency upgrades, especially no Expo, React Native, video/media, native, or PoW package changes.

## Principles

- Preserve behavior first. Each extraction should be mechanically reviewable and verified with focused lint/typecheck.
- Extract ownership, not aesthetics:
  - hooks for state/effect orchestration
  - feature components for independently understandable UI sections
  - cache/service helpers for non-UI logic
  - parser/normalizer modules for data transformation
- Keep styles colocated unless they are shared by extracted sibling components.
- Keep feature-local modules under the owning feature folder unless reused outside that feature.
- Avoid broad rewrites and dependency changes.

## Current Largest Hotspots

1. `src/pages/post/post-detail-content.tsx` (~3050 lines)
2. `src/pages/post/media-post-detail-content.tsx` (~2820 lines)
3. `src/pages/create/create-content.tsx` (~2620 lines)
4. `src/components/molecules/post-card-media.tsx` (~1680 lines)
5. `src/pages/quests/quests-content.tsx` (~1560 lines)
6. `src/pages/user/user-profile-content.tsx` (~1460 lines)
7. `src/pages/profile/profile-content.tsx` (~1290 lines)
8. `src/pages/search/search-content.tsx` (~1280 lines)
9. `src/pages/annotate/annotate-content.tsx` (~1270 lines)
10. `src/services/inbox-notifications.ts` (~1190 lines)
11. `src/pages/comment/comment-compose-content.tsx` (~1180 lines)
12. `src/pages/auth/username-content.tsx` (~1160 lines)
13. `src/api/write/hooks/use-post.ts` (~1120 lines)
14. `src/utils/fetch-link-meta.ts` (~1060 lines)
15. `src/pages/topic/topic-feed-content.tsx` (~1040 lines)

## Phase 1 — Post Detail Ownership Split ✅ Complete

Target: `src/pages/post/post-detail-content.tsx`

Revised target shape: `post-detail-content.tsx` should become a thin screen shell that wires route params and global providers, then delegates to vertical UI slices. State/effects should move with the UI that owns them.

Extract in this order:
- `post-detail-screen-shell.tsx`: route wrapper/shell that chooses immersive media vs legacy detail and owns only screen-level route gating.
- `post-detail-post-section.tsx`: post card, loading skeleton, reveal state, post vote/follow/topic actions, sticky header layout callbacks, and thread-reminder UI.
- `post-detail-comments-section.tsx`: comment list, comment skeletons, empty/error/loading comments state, highlight scrolling, focused-thread controls, and comment vote/reply actions.
- `post-detail-comment-composer.tsx`: comment input, replying-to state, submit mutation, optimistic insert/replace/remove flow, and auto-focus effects.
- `post-detail-action-sheets.tsx`: comment/post option sheets, award/gift sheets, delete/block/report popups, and their local target state.
- `use-post-detail-data.ts`: root post/comment queries and server data normalization that is shared by the above slices.
- `post-detail-comment-utils.ts`: pure comment tree helpers only.
- `post-detail-media-routing.ts`: pure logic that decides whether to open media detail, external URLs, or inline rendering.

Success:
- The content file is a coordinator only; post UI, comments UI, composer UI, and sheet UI own their own hooks/effects.
- Focused lint/typecheck passes.

Progress:
- Added `src/pages/post/use-post-detail-media-route.ts` to own focused route resolution, root post lookup, Sentry route diagnostics, and immersive media gating.
- Added `src/pages/post/post-detail-media-routing.ts` for pure cached-post lookup and immersive-media checks.
- Added `src/pages/post/post-detail-comment-utils.ts` for focused-thread construction, optimistic comment merging, hidden/blocked filtering, tree search, and tree counting.
- Added `src/pages/post/post-detail-empty-comments.tsx` and `src/pages/post/post-detail-comment-skeleton.tsx` for empty/loading comment states.
- Added `src/pages/post/post-detail-action-sheets.tsx` so option sheets, award/gift sheets, report sheet presentation, and delete/block popups own their refs and local target state.
- Added `src/pages/post/post-detail-comments-section.tsx` so the comments FlatList owns comment rendering, empty/loading state, refresh controls, and scroll failure handling.
- Added `src/pages/post/post-detail-post-section.tsx` so the post card/thread reminder UI owns reveal state and its section-level rendering.
- Added `src/pages/post/post-detail-comment-composer.tsx` so replying-to state, comment input ref/focus, pending compose submission, comment mutation, and optimistic insert/replace/remove flow live with the composer UI.
- Added `src/pages/post/use-post-detail-focused-thread.ts` so focused-thread/root/context query state and effects are owned outside the screen coordinator.
- Added `src/pages/post/post-detail-header.tsx`, `src/pages/post/post-detail-not-found.tsx`, and `src/pages/post/post-detail-sticky-summary.tsx` for route-level header/error/summary UI slices.
- Added `src/pages/post/use-post-detail-highlight-scroll.ts` for highlight state, retry/refetch behavior, precise scroll measurement, and composer highlight coordination.
- Added `src/pages/post/use-post-detail-sticky-header.ts` for sticky-summary scroll state, video visibility, and animated header style.
- Added `src/pages/post/use-post-detail-pending-comment-edit.ts` for pending comment-edit queue orchestration and optimistic edit overrides.
- Added `src/pages/post/use-post-detail-comments-lifecycle.ts` for screen/app focus state and debounced silent comment refresh.
- Moved delete/block/report/edit/annotate/follow action ownership into `src/pages/post/post-detail-action-sheets.tsx`, backed by shared content moderation, post-count, and post-detail action state stores instead of parent action callbacks.
- Moved post-card navigation, vote, follow, block/report sheet triggers into `src/pages/post/post-detail-post-section.tsx`, leaving the parent with a single action-sheet ref instead of individual action props.
- Added `src/pages/post/use-post-detail-post-state.ts`, `src/pages/post/use-post-detail-resolved-post.ts`, and `src/pages/post/use-post-detail-comment-voting.ts` for post cache resolution/history sync, post follow/vote/display state, and comment vote overrides.
- Reduced `post-detail-content.tsx` from ~3057 lines to ~642 lines without style-only extraction.

## Phase 2 — Media Post Detail Split

Target: `src/pages/post/media-post-detail-content.tsx`

Extract:
- media carousel/player hook
- comment sheet state hook
- focus/playback lifecycle hook
- media header/actions component

Success:
- Media playback state has one owning hook.
- Comment sheet UI is separated from player orchestration.

Progress:
- Added `src/pages/post/media-post-detail-media-item.tsx` so image/video rendering, video registration, mute state, and position restore are owned by the media item slice.
- Added `src/pages/post/media-post-detail-seek-bar.tsx` for draggable seek controls and video time formatting.
- Added `src/pages/post/media-post-detail-comment-sheet.tsx` so the bottom sheet owns sheet header, focused-thread reminder UI, comment rendering, empty/loading states, and scroll failure handling.
- Added `src/pages/post/media-post-detail-footer.tsx` and `src/pages/post/media-post-detail-follow-menu-button.tsx` for expanded-mode post actions, follow menu, and video controls.
- Added `src/pages/post/media-post-detail-header.tsx` and `src/pages/post/media-post-detail-not-found.tsx` for route-level header/error UI slices.
- Added `src/pages/post/use-media-post-detail-layout.ts` and `src/pages/post/use-media-post-detail-video-controls.ts` for collapse/sheet animation layout and active video controller state.
- Added `src/pages/post/media-post-detail-gallery.tsx` for pager media rendering, gallery dots, and compact collapsed video controls.
- Added `src/pages/post/use-media-post-detail-pending-comment.ts` for pending compose-store comment submission and optimistic comment insertion.
- Added `src/pages/post/media-post-detail-action-sheets.tsx` so post/comment options, report, delete, block, awards, gifts, save, and sheet-local selected comment state are owned by the sheet slice instead of the parent.
- Added `src/pages/post/use-media-post-detail-data.ts` for root post resolution, followed users/topics, comment queries, focused-context display modeling, optimistic comment merges, comment vote overrides, pruning, and hidden/blocked comment filtering.
- Reduced `media-post-detail-content.tsx` from ~2818 lines to ~671 lines without style-only extraction; it is now below the large-file warning threshold.

## Phase 3 — Create Flow Split

Target: `src/pages/create/create-content.tsx`

Extract:
- media upload orchestration hook
- share-intent initialization hook
- edit-mode initialization hook
- submit flow hook
- attachment/link/poll UI sections

Success:
- Create content becomes composition of flow hooks + sections.
- Upload module state remains isolated in existing create upload modules.

Progress:
- Added `src/pages/create/create-overlays.tsx` for share-link processing and media preparation overlays.
- Added `src/pages/create/create-header.tsx`, `src/pages/create/create-editability-banner.tsx`, and `src/pages/create/create-community-selector.tsx` for route-level header/edit/topic UI slices.
- Added `src/pages/create/create-link-input.tsx` for the link attachment form.
- Added `src/pages/create/create-image-preview-carousel.tsx`, `src/pages/create/create-upload-warning.tsx`, and `src/pages/create/create-sticker-preview.tsx` for attachment preview/status UI.
- Added `src/pages/create/create-title-input.tsx`, `src/pages/create/create-body-input.tsx`, `src/pages/create/create-content-warning-button.tsx`, and `src/pages/create/create-compose-accessories.tsx` for text-entry and composer accessory UI.
- Added `src/pages/create/create-screen-modals.tsx` for the modal stack and `src/pages/create/use-create-edit-initialization.ts` for edit-mode draft initialization/restoration.
- Added `src/pages/create/create-compose-state.ts` and moved topic/content-warning/link/sticker modal and form ownership into the extracted create slices instead of drilling those action props through `create-content.tsx`.
- Moved title/body draft updates, mention insertion, image removal, and video edit/remove preview actions into their owning create slices.
- Added `src/pages/create/use-create-share-intent.ts` for share-intent recovery, metadata fetching, media import, and shared-link draft hydration.
- Added `src/pages/create/use-create-media-uploads.ts` for image/video upload state, retries, progress, reset, and upload URL resolution.
- Added `src/pages/create/use-create-submit-flow.ts` for create/edit submission, optimistic queue insertion, PoW progress, edit cache updates, and submit cleanup.
- Reduced `create-content.tsx` from ~2624 lines to ~564 lines; it is now below the large-file warning threshold and mostly coordinates picker/video-return lifecycle plus layout.

## Phase 4 — Post Card Media Split

Target: `src/components/molecules/post-card-media.tsx`

Extract:
- native video controller hook
- YouTube renderer component
- native video renderer component
- image/GIF renderer component
- processing/retry state hook

Success:
- Component reads like media-type dispatch + shared overlays.
- Video-specific effects live in hooks/renderers.

## Phase 5 — Services and API Hotspots

Targets:
- `src/services/inbox-notifications.ts`
- `src/api/write/hooks/use-post.ts`
- `src/utils/fetch-link-meta.ts`

Extract:
- notification permission/registration module
- notification listener module
- notification sync/check loop module
- create/edit/delete/comment mutation modules
- optimistic post/comment cache helpers
- link metadata fetchers/parsers/normalizers

Success:
- Services expose clear public APIs with small internal modules.
- Mutation hooks are easier to test and reason about.

## Phase 6 — Remaining Page Hotspots

Targets:
- quests
- user profile
- profile
- search
- annotate
- comment compose
- username onboarding
- topic feed

Extract only where ownership is clear:
- section components
- tab/feed hooks
- mutation/action hooks
- pure utilities

Progress:
- Split `src/pages/quests/quests-content.tsx` into feature-owned UI slices: `quests-confetti.tsx`, `quests-claim-success-modal.tsx`, `quests-skeleton.tsx`, `quests-countdown-timer.tsx`, `quest-card.tsx`, `flash-quest-card.tsx`, `quests-claim-controls.tsx`, and `quests-ui-constants.ts`.
- Reduced `quests-content.tsx` from ~1565 lines to ~344 lines; it is now below the large-file warning threshold and mostly owns query/claim orchestration plus screen composition.
- Added `src/pages/topic/topic-feed-header.tsx` for topic title, sort menu, back button, and topic-follow header controls.
- Reduced `topic-feed-content.tsx` from ~1039 lines to ~890 lines; it is now below the large-file warning threshold.
- Split `src/pages/auth/username-content.tsx` into onboarding shell slices: `username-header.tsx`, `username-footer.tsx`, `username-server-modal.tsx`, `username-registration-unavailable-modal.tsx`, and `username-styles.ts`.
- Reduced `username-content.tsx` from ~1161 lines to ~878 lines; it is now below the large-file warning threshold and mostly owns username/invite validation plus account setup orchestration.
- Split `src/pages/comment/comment-compose-content.tsx` into `comment-compose-utils.ts`, `comment-compose-link-section.tsx`, `comment-compose-header.tsx`, and `comment-compose-reply-banner.tsx` for pure parsing helpers and focused compose UI slices.
- Reduced `comment-compose-content.tsx` from ~1184 lines to ~993 lines; it is now below the large-file warning threshold while still owning draft, upload, submit, GIF, sticker, and mention orchestration.
- Split `src/pages/annotate/annotate-content.tsx` into focused UI slices for header, post summary, agent banner, appendix, content-warning modal, topic/tag controls, text override fields, and shared toggle UI.
- Reduced `annotate-content.tsx` from ~1269 lines to ~916 lines; it is now below the large-file warning threshold.
- Split `src/pages/search/search-content.tsx` into `search-utils.ts`, `search-post-result.tsx`, and `search-recent-item.tsx` for helpers and reusable result rows.
- Reduced `search-content.tsx` from ~1284 lines to ~999 lines; it is now below the large-file warning threshold.
- Split profile post action ownership into `src/pages/profile/profile-post-action-sheets.tsx`, moving save/delete/block/report hooks out of the profile screen and exposing only a small imperative ref for post-card triggers.
- Extracted shared profile feed video viewability into `src/pages/profile/use-profile-feed-video-state.ts`, removing duplicate visible/nearby/active video orchestration from profile screens.
- Reduced `profile-content.tsx` from ~1291 lines to ~967 lines; it is now below the large-file warning threshold.
- Split `src/pages/user/user-profile-content.tsx` into `user-profile-feed-items.tsx` and `user-profile-list-footer.tsx`, while reusing the profile action-sheet container and video-state hook.
- Reduced `user-profile-content.tsx` from ~1466 lines to ~999 lines; it is now below the large-file warning threshold.
- `bun tools/check-file-sizes.mjs` now passes with no large implementation-file warnings.

## Verification Cadence

After each extraction batch:
- `bunx eslint <changed files>`
- `bun run typecheck`
- `bun run check:architecture`

Before each PR:
- `bun run check:architecture`
- confirm no dependency changes
- confirm file-size guardrail only reports known implementation warnings
