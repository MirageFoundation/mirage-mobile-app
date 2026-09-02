# Mobile QA bug ledger (BUG-001–BUG-041)

Walk this file one ID at a time. Product decisions here are canonical so accepted/by-design items are not reopened.

Related but **separately numbered**: `docs/qa-findings.md`. Do not mix those IDs with this sheet.

Source sheet (mobile/non-web rows only; ignore `BUG-WEB-*`):
https://docs.google.com/spreadsheets/d/1j85HE0wo1tcLJZuHeKORUS70wnjbWkDC6WoVN6-IdDU

Last updated: 2026-09-02. Static-code + node-API audit, then implementation-status reconciliation for prompts and topic search. **No device/build verification in this pass.**

---

## Scope

- Include every sheet issue **BUG-001 through BUG-041** exactly once.
- Exclude every **BUG-WEB-*** item.
- Checkboxes mark **actionable remaining work**:
  - `[ ]` work, retest, investigation, backend follow-up, or blocked wait remains
  - `[x]` no remaining mobile work (resolved, or accepted/by-design)
- Optional retests are noted in the row; they do not reopen accepted product decisions.

---

## Status legend

| Status | Meaning |
|---|---|
| **resolved** | Targeted mobile fix is in current code. No remaining implementation. Device confirmation not claimed unless noted. |
| **accepted / by-design** | Product decision. Do not implement a “fix.” |
| **accepted / resolved** | Current client behavior matches node capability. Not a missing mobile feature. |
| **deferred** | Real gap, but blocked on an external input. Do not implement now. |
| **in progress** | Implementation is underway in this repo. |
| **needs-retest** | Static audit found a plausible current-code fix. Still needs current iOS/Android reproduction. |
| **open** | Still looks like a mobile defect or product gap from static audit. |
| **backend / external** | Depends on node, bots, or other clients. Mobile cannot close it alone. |
| **runtime investigation** | Not decidable from source. Needs device traces, lifecycle, or perf capture. |

---

## Current priority order

Do these first (user-requested decisions / just-landed current-build retests):

1. **BUG-023** / **BUG-024** — home-entry prompt orchestration (implementation complete; needs current-build device retest)
2. **TRACK-TOPIC-SEARCH-CASE** — uppercase topic search normalization (non-sheet; resolved in code; needs current-build UI retest)
3. **BUG-001** — legal links (deferred; wait for URLs)
4. **BUG-011** — inbox read sync (accepted / resolved; optional inbox-level retest only)
5. **BUG-015** — iOS Perks hidden (accepted / by-design)
6. **BUG-017** — adult-tag filters local-only (accepted / resolved)
7. **BUG-022** — usernames English/ASCII-only (accepted / by-design)
8. **BUG-036** — Balance closes side menu (resolved in code + 5 unit tests)

Then remaining likely-fixed **current-build retests**:

9. BUG-002, 004, 005, 006, 009, 012, 016, 018, 020, 021, 032, 033, 037, 038

Then remaining **clearly actionable open** mobile issues:

10. BUG-025, BUG-027

Then **backend / external**:

11. BUG-008, 010, 013, 014, 019, 028, 029, 031, 039, 040

Then **runtime investigation**:

12. BUG-003, 007, 026, 030, 034, 035, 041

---

## BUG-001–BUG-041

### [ ] BUG-001 — Privacy Policy / User Agreement links unresponsive on onboarding

- **Status:** deferred
- **Decision:** Real gap, but **do not implement** until legal URLs are supplied. Placeholder `Linking.openURL` / fake pages are not wanted.
- **Evidence:** both links are `console.log` only — `src/pages/auth/username-content.tsx:869-884`.
- **Next:** wait for Privacy Policy + User Agreement URLs; then wire real openers. Keep unchecked until URLs exist.

### [ ] BUG-002 — Registration / recovery-phrase state lost after Android background

- **Status:** needs-retest
- **Decision / evidence:** pending signup wallets are resumed, including mnemonic recovery — `src/stores/auth-store.ts:181-207`; auth identity persist — `src/stores/auth-store.ts:643-655`.
- **Next:** Android background + process-recreate on the 12-word screen. Do not claim device-fixed.

### [ ] BUG-003 — Feed / scroll position lost after opening an external link

- **Status:** runtime investigation
- **Decision / evidence:** still `Linking.openURL` — `src/components/molecules/post-card.tsx:196-200`. Home visibility is live scroll offset, not a durable restore — `src/pages/home/home-post-list-visibility.ts:54-66`. OS process death cannot be prevented in-app.
- **Next:** Android low-memory: open external URL, return, record whether the process was killed vs a client reset.

### [ ] BUG-004 — Zoomed image pans infinitely into a white screen

- **Status:** needs-retest
- **Decision / evidence:** pan clamped to scaled viewport — `src/components/molecules/use-preview-zoom-gesture.ts:10-17`, `:75-89`.
- **Next:** Android (original Redmi) 2–4× zoom horizontal pan stress.

### [ ] BUG-005 — Vertical drag on zoomed image jumps / white-flashes

- **Status:** needs-retest
- **Decision / evidence:** same clamp on Y — `src/components/molecules/use-preview-zoom-gesture.ts:63-72`, `:84-88`.
- **Next:** pinch + vertical drag on tall/short/partially loaded images.

### [ ] BUG-006 — Embedded video frozen after lock/unlock

- **Status:** needs-retest
- **Decision / evidence:** listens for `inactive` and `background`, then recovers on foreground — `src/components/molecules/use-post-card-video-health.ts:237-258`.
- **Next:** lock/unlock during play/pause on iOS and Android.

### [ ] BUG-007 — App randomly restarts after 1–2 min background

- **Status:** runtime investigation
- **Decision / evidence:** foreground path avoids an unconditional feed reset and checks for new posts — `src/pages/home/use-home-screen-controller.tsx:337-366`. Cannot stop OS process death.
- **Next:** Android 1–2 min background under normal and memory pressure; record process-kill vs in-app reset.

### [ ] BUG-008 — Daily Quest counter increments on cancelled likes

- **Status:** backend / external
- **Decision / evidence:** mobile only renders server `daily_quests` — `src/components/molecules/quests-summary-card.tsx:230-239`. Vote handler does not compute quest progress.
- **Next:** node/rewards: like then unlike and inspect `/rewards/summary`. Not a mobile counting bug unless the client double-submits.

### [ ] BUG-009 — Moderation banner reappears after “Remind me later”

- **Status:** needs-retest
- **Decision / evidence:** snooze/dismiss is wallet-keyed and lowercased — `src/pages/home/use-home-screen-controller.tsx` via home-entry prompts; persist migration — `src/stores/preferences-store.ts:346-359`. Orchestrator now sequences this after adult (`src/services/home-entry-prompt-orchestrator.ts:59-66`).
- **Next:** “Remind me later”, restart, then retest before/after snooze expiry. Account-switch too.

### [ ] BUG-010 — Cross-device feed delay after publishing

- **Status:** backend / external
- **Decision / evidence:** client discovers new posts by polling/refetch — `src/pages/home/use-home-screen-controller.tsx:353-366`. Instant cross-device appearance is node feed consistency.
- **Next:** publish on device A while capturing feed responses on B.

### [x] BUG-011 — Notification unread state does not sync per item across devices

- **Status:** accepted / resolved (node-limited)
- **Decision:** Node exposes account-level `POST /api/mark_inbox_viewed` only. Mobile already calls it on inbox focus. Per-reply IDs are **local by node limitation**. Do **not** build a per-item cross-device sync feature.
- **Evidence:** `src/api/write/endpoints/inbox.ts:10-18`; inbox focus calls `markInboxViewed` — `src/pages/inbox/use-inbox-controller.ts:239-252`; local per-reply IDs — `src/stores/inbox-store.ts:68-83`.
- **Next:** optional only — confirm inbox-level unread/badge clears on device B after A opens inbox. Not required to close this ID.

### [ ] BUG-012 — “New Posts” banner tap does not refresh the feed

- **Status:** needs-retest
- **Decision / evidence:** banner press runs an explicit async refresh — `src/pages/home/use-home-screen-controller.tsx:439-442`; race documented in `docs/qa-findings.md:26`.
- **Next:** tap during an in-flight pull-refresh and on slow network.

### [ ] BUG-013 — “Days in App” tenure updates hours late

- **Status:** backend / external
- **Decision / evidence:** client subtracts server epoch seconds — `src/pages/profile/profile-state.ts:45-51`; timestamp from profile/status — `src/pages/profile/use-profile-controller.ts:182`.
- **Next:** compare raw `created_at` / `profile_registered_at` to the 24h boundary. Client just renders the timestamp.

### [ ] BUG-014 — Profile “Reserve” balance appears frozen

- **Status:** backend / external
- **Decision / evidence:** side-menu/profile numbers come from server `userStatus` — `src/features/side-menu/use-side-menu-controller.ts:71-72`. Existing note: `reserve_funds` is subscription escrow, not an interaction counter — `docs/qa-findings.md:44`.
- **Next:** confirm product copy vs node escrow semantics. Likely expectation mismatch, not a mobile counter bug.

### [x] BUG-015 — “Perks” missing on iOS side menu

- **Status:** accepted / by-design
- **Decision:** Perks is MIRAGE-token subscription management and is **intentionally hidden on iOS** for App Store / IAP compliance. Not a parity bug.
- **Evidence:** `hideOnIos: true` — `src/features/side-menu/side-menu-model.ts:29-38`; renderer — `src/features/side-menu/side-menu-content.tsx:61`.
- **Next:** none. Do not unhide on iOS without a Store-safe IAP redesign.

### [ ] BUG-016 — Referral link generate/copy fails

- **Status:** needs-retest
- **Decision / evidence:** invite code/URL copy uses `Clipboard.setStringAsync` — `src/pages/invite/invite-and-earn-content.tsx:277-302`; native share — `:315-328`.
- **Next:** generate, copy, paste, share on both platforms; validate signup URL, not only clipboard success.

### [x] BUG-017 — NSFW / 18+ filter does not sync across devices

- **Status:** accepted / resolved (no account-sync API)
- **Decision:** Adult-tag **display filters are local-only on mobile and web**. Node has no account-level preference sync; requests only send `allowed_tags`. Do not invent a mobile-only sync protocol.
- **Evidence:** local Zustand — `src/stores/preferences-store.ts:145-160`, `:193-209`; request param — `src/api/read/request-params.ts:18-24`, `src/services/bootstrap.ts:71`.
- **Next:** none for sync. If product later wants account sync, that is a node API.

### [ ] BUG-018 — “BALANCE … MIRAGE” header not tappable

- **Status:** needs-retest
- **Decision / evidence:** balance is a pressable card — `src/features/side-menu/side-menu-content.tsx:84-92`; destination `/profile` because no wallet screen exists — `src/features/side-menu/side-menu-model.ts:182-183`. Overlay close is BUG-036.
- **Next:** confirm press opens Profile. Wallet screen is out of scope until it exists.

### [ ] BUG-019 — iOS vs Android main-feed ordering differs

- **Status:** backend / external
- **Decision / evidence:** client consumes server order and avoids silently replacing page one — `src/api/read/infinite-posts-policy.ts:13-19`.
- **Next:** capture identical feed requests/responses on both devices before blaming the client.

### [ ] BUG-020 — Haptic vibration on tapping plain post body text (iOS)

- **Status:** needs-retest
- **Decision / evidence:** `handlePress` returns before haptics when there is no action — `src/components/molecules/post-card.tsx:180-185`.
- **Next:** tap inert detail body text (no haptic) vs tappable feed cards (haptic + navigate).

### [ ] BUG-021 — “New Posts” banner appears over post detail

- **Status:** needs-retest
- **Decision / evidence:** home focus recorded and banner gated on focus — `src/pages/home/use-home-screen-controller.tsx:112`, `:538`.
- **Next:** leave home mounted under post detail, wait for a new post, confirm no overlay.

### [x] BUG-022 — Username field blocks non-English keyboard input

- **Status:** accepted / by-design
- **Decision:** Usernames are **intentionally English/ASCII-only** (`[a-zA-Z0-9-]`). Non-Latin input is supposed to be stripped. Do not add Unicode usernames.
- **Evidence:** sanitizer — `src/pages/auth/username-content.tsx:259-260`.
- **Next:** none for usernames. Topic search case is a **separate** item below, not this bug.

#### [ ] TRACK-TOPIC-SEARCH-CASE — Uppercase topic search should match lowercase topics

- **Status:** needs-retest (resolved in code; not a sheet ID)
- **Decision:** Separate from BUG-022. Users searching `News` should hit topic `news`. Uppercase and whitespace now normalize **before** the topic API request and query key. Dedicated topics, unified `type=topics`, and `#Topic` are covered. Non-topic search stays case-preserving.
- **Evidence:** `src/api/read/search-query.ts`, `src/api/read/hooks/use-search.ts`, `src/api/read/hooks/use-topics.ts`, `tests/topic-search-normalization.test.ts`. Verification reported: **9 tests passed**; ESLint and `check:query-keys` passed. **No current-build UI retest claimed.**
- **Next:** current-build UI retest of topic search (`News`, `  NEWS  `, `#Topic`). Do not change username rules.

### [ ] BUG-023 — NSFW / 18+ consent prompt missing on mobile onboarding

- **Status:** needs-retest (implementation complete)
- **Decision:** New users default `hasSeenAdultPrompt` **false**; existing persisted answers are preserved. Adult prompt is eligible only when authenticated, initialization is complete, app is active, and Home is focused. Orchestration is deterministic: **adult → moderation → analytics → notifications**. One prompt at a time. **No timer-based initial appearance.**
- **Evidence:** default unseen + eligibility/order — `src/services/home-entry-prompt-orchestrator.ts`; wired from home — `src/pages/home/use-home-screen-controller.tsx` + `src/services/use-resolved-home-entry-prompt.ts`. Shared prompt verification with BUG-024: **12 focused tests passed**; ESLint, store boundaries, architecture boundaries, and file-size checks passed. **No device verification claimed.**
- **Next:** current-build clean-install / new-wallet retest: adult prompt appears on first focused Home, not while logged out or during init.

### [ ] BUG-024 — AI moderation prompt delayed (~10–15 min) instead of home entry

- **Status:** needs-retest (implementation complete)
- **Decision:** Initial **10-minute timing removed**. After adult is handled (or already seen), show moderation on home entry if not understood and not snoozed. Same deterministic order as BUG-023: **adult → moderation → analytics → notifications**. Only one prompt at a time. Explicit moderation snooze/dismiss remains.
- **Evidence:** `src/services/home-entry-prompt-orchestrator.ts`. Verification reported: **12 focused tests passed**; ESLint, store boundaries, architecture boundaries, and file-size checks passed. **No device verification claimed.**
- **Next:** current-build retest: new accounts see adult then moderation with no idle delay; snooze/dismiss still honored afterward.

### [ ] BUG-025 — Quest header progress stale until Quests tab opened

- **Status:** open
- **Decision / evidence:** header uses `useRewardSummary()` without action-driven invalidation — `src/components/molecules/quests-summary-card.tsx:209-218`; query fresh for 5 minutes — `src/api/read/hooks/use-reward-summary.ts:40-46`.
- **Next:** invalidate/refetch the header summary on quest-related mutation success (mobile-actionable).

### [ ] BUG-026 — Login cooldown bypassed by backgrounding the app

- **Status:** runtime investigation
- **Decision / evidence:** login page has no client cooldown state — `src/pages/auth/login-page.tsx`. Restriction is likely server rate-limit UI, not a persisted timer.
- **Next:** capture the rate-limit response, background, restore, retry; record status/body. May be backend TTL, not a client bypass.

### [ ] BUG-027 — Guest feed stuck at ~5 static posts / slow images

- **Status:** open
- **Decision / evidence:** logged-out home fetches welcome stats/node config, not a public post-feed query — `src/pages/home/logged-out-home-content.tsx:33-50`.
- **Next:** confirm whether guest feed is still a product requirement. If yes, mount the public feed; if no, close as by-design after product sign-off.

### [ ] BUG-028 — Downvotes hide posts / vote state lost on refresh

- **Status:** backend / external
- **Decision / evidence:** client default `hideDownvotedPosts: false` — `src/stores/preferences-store.ts:157`. Omission/persistence then depends on server feed + vote cache.
- **Next:** record vote mutation + refreshed feed payload per post.

### [ ] BUG-029 — Admin / moderation selection sync delay across devices

- **Status:** backend / external
- **Decision / evidence:** reminder/admin presentation is server user state + local snooze keys — home-entry / preferences. Cross-device choice is node consistency.
- **Next:** compare write response and later bootstrap/status on both devices.

### [ ] BUG-030 — Severe lag after 15+ minutes of use

- **Status:** runtime investigation
- **Decision / evidence:** video retry/lifecycle exists — `src/components/molecules/use-post-card-video-health.ts:237-258`. A 15-minute FPS/memory regression cannot be proven statically.
- **Next:** Instruments / Android Studio over a 20–30 min mixed-media session.

### [ ] BUG-031 — Tenure shows “2 minutes” immediately after signup

- **Status:** backend / external
- **Decision / evidence:** same client math as BUG-013 — `src/pages/profile/profile-state.ts:45-51`. Immediate offset is server timestamp or clock skew.
- **Next:** log raw registration timestamp vs device time right after signup.

### [ ] BUG-032 — Create Post keeps previous title/category

- **Status:** needs-retest
- **Decision / evidence:** successful enqueue resets compose/uploads/draft — `src/pages/create/use-create-submit-flow.ts:455-465`; initial state — `src/pages/create/create-compose-state.ts:28-81`.
- **Next:** publish, immediately reopen Create, confirm empty fields before queue completion.

### [ ] BUG-033 — Multi-image posts cropped / misaligned

- **Status:** needs-retest
- **Decision / evidence:** gallery height from width/height or aspect, cap 450 — `src/components/molecules/media-gallery-sizing.ts:12-38`.
- **Next:** 3+ mixed portrait/landscape in feed and detail. Visual-only; code cannot prove native layout.

### [ ] BUG-034 — Moderation modal dismisses on Android scroll / nav-bar gesture

- **Status:** runtime investigation
- **Decision / evidence:** current UI is a feed card composed through `src/pages/home/home-screen-sections.tsx:41-51`, not enough to prove the old modal/gesture bug.
- **Next:** gesture-nav and 3-button Android, including safe-area scroll. Re-evaluate against the landed BUG-023/024 home-entry prompt UI.

### [ ] BUG-035 — Interacting in post detail kicks back to main feed

- **Status:** runtime investigation
- **Decision / evidence:** banner is focus-gated — `src/pages/home/use-home-screen-controller.tsx:538`. Reported “inline refresh / prompt actions” have no deterministic reset path in static review.
- **Next:** capture exact control, route before/after, and navigation logs.

### [x] BUG-036 — Side menu stays open after tapping Balance

- **Status:** resolved
- **Decision:** Balance now **closes the side menu before** navigating to `/profile`.
- **Evidence:** `dismissThenNavigate(close, …)` — `src/features/side-menu/use-side-menu-controller.ts:228-233`; destination `/profile` — `src/features/side-menu/side-menu-model.ts:182-187`. Verified by **5 focused unit tests** in `tests/side-menu-controller.test.ts` (including “opens balance on profile after dismissing the overlay”). **No device verification claimed.**
- **Next:** none required. Optional smoke: open menu → tap Balance → overlay gone, Profile visible.

### [ ] BUG-037 — Shared profile/referral link opens the local user instead of the target

- **Status:** needs-retest
- **Decision / evidence:** URL parsed to a concrete target; cold-start keeps pending route before self-normalization — `src/navigation/linking.ts:244-269`; user route — `app/(app)/user/[id].tsx:1-3`.
- **Next:** copy Account A profile link, open while logged in as B; warm and cold start.

### [ ] BUG-038 — Low contrast on Following / Topics tab in dark theme

- **Status:** needs-retest
- **Decision / evidence:** inactive labels use theme `text.subtle`, not a hard-coded light color — `src/components/molecules/feed-type-tab-bar.tsx:119`.
- **Next:** measure dark-theme contrast on device. Token use ≠ WCAG proof.

### [ ] BUG-039 — Reddit-extracted video quality is severely compressed

- **Status:** backend / external
- **Decision / evidence:** client has a Reddit metadata path — `src/utils/reddit-embed-meta.ts:1-124`. Static code cannot prove upstream rendition quality.
- **Next:** compare resolved source URL/bitrate to the original Reddit asset.

### [ ] BUG-040 — Anti-spam bot applies duplicate tags

- **Status:** backend / external
- **Decision / evidence:** bot execution / tag idempotency is not in this mobile repo.
- **Next:** node/bot jobs; enforce an idempotency key per post/action.

### [ ] BUG-041 — Cold-launch “screen wobble” / delayed first paint

- **Status:** runtime investigation
- **Decision / evidence:** reward summary hydrates from persist to avoid a second pop-in — `src/api/read/hooks/use-reward-summary.ts:13-18`. Wobble may still be nav, safe-area, fonts, or cache hydration.
- **Next:** slow-motion cold launches + React/native traces; identify which layout dimensions change.

---

## Checkbox summary

| Remaining work `[ ]` | No remaining mobile work `[x]` |
|---|---|
| Deferred: 001 | Accepted: 011, 015, 017, 022 |
| Open: 025, 027 | Resolved: 036 |
| Needs-retest: 002, 004, 005, 006, 009, 012, 016, 018, 020, 021, **023, 024**, 032, 033, 037, 038 + TRACK-TOPIC-SEARCH-CASE | |
| Backend: 008, 010, 013, 014, 019, 028, 029, 031, 039, 040 | |
| Runtime: 003, 007, 026, 030, 034, 035, 041 | |
