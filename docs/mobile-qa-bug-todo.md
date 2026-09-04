# Mobile QA bug ledger (BUG-001–BUG-041)

Walk this file one ID at a time. Product decisions here are canonical so accepted/by-design items are not reopened.

Related but **separately numbered**: `docs/qa-findings.md`. Do not mix those IDs with this sheet.

Source sheet (mobile/non-web rows only; ignore `BUG-WEB-*`):
https://docs.google.com/spreadsheets/d/1j85HE0wo1tcLJZuHeKORUS70wnjbWkDC6WoVN6-IdDU

Last updated: 2026-09-03. Final audit/fix reconciliation for BUG-008/010/013/014/019/026/028–031/034/035/039–041. **No device/build verification in this pass.**

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
| **needs-retest** | Implementation complete or a plausible current-code fix. Still needs current iOS/Android reproduction. |
| **open** | Still looks like a mobile defect or product gap from static audit. |
| **backend / external** | Depends on node, bots, or other clients. Mobile cannot close it alone. |
| **runtime investigation** | Not decidable from source. Needs device traces, lifecycle, or perf capture. |

---

## Current priority order

No remaining open mobile implementation in this sheet set.

1. **Device retest (current build):** BUG-002–007, 009, 012, 013, 016, 018, 020, 021, 023, 024, 025, 028 (feed-contract), 032, 033, 034, 035, 037, 038, 039, 041 + TRACK-TOPIC-SEARCH-CASE
2. **Profiling:** BUG-030 (20–30 min mixed-media session; seen-map now capped)
3. **Backend / product:** BUG-008, 010, 026, 029, 031, 040
4. **Deferred:** BUG-001 (legal URLs), BUG-027 (guest feed)
5. **Accepted / resolved (do not reopen):** BUG-011, 014, 015, 017, 019, 022, 036

---

## BUG-001–BUG-041

### [ ] BUG-001 — Privacy Policy / User Agreement links unresponsive on onboarding

- **Status:** deferred
- **Decision:** Real gap, but **do not implement** until legal URLs are supplied. Placeholder `Linking.openURL` / fake pages are not wanted.
- **Evidence:** both links are `console.log` only — `src/pages/auth/username-content.tsx:869-884`.
- **Next:** wait for Privacy Policy + User Agreement URLs; then wire real openers. Keep unchecked until URLs exist.

### [ ] BUG-002 — Registration / recovery-phrase state lost after Android background

- **Status:** needs-retest (implementation complete)
- **Decision / evidence:** Onboarding **auth-init / live recovery-phrase** hardening: pending signup wallets resume, including live mnemonic recovery, instead of resetting to step 1 after background. Group verification (BUG-002–007): **20 focused tests**; ESLint, file-size, navigation, and store checks passed. **No device verification claimed.**
- **Next:** Android background + process-recreate on the 12-word screen.

### [ ] BUG-003 — Feed / scroll position lost after opening an external link

- **Status:** needs-retest (implementation complete; **process-death residual**)
- **Decision / evidence:** Returning from an external link now **recomputes foreground feed visibility**. There is still **no durable scroll persistence across OS process death** — that limitation remains. Same group verification as BUG-002: 20 focused tests; ESLint, file-size, navigation, store checks passed. **No device verification claimed.**
- **Next:** Android low-memory: open external URL, return, record process-kill vs same-runtime restore. Process death still cannot restore scroll.

### [ ] BUG-004 — Zoomed image pans infinitely into a white screen

- **Status:** needs-retest (implementation complete)
- **Decision / evidence:** Live zoom pan now clamps to **current scale and measured size** (not a stale layout). Same group verification as BUG-002. **No device verification claimed.**
- **Next:** Android (original Redmi) 2–4× zoom horizontal pan stress.

### [ ] BUG-005 — Vertical drag on zoomed image jumps / white-flashes

- **Status:** needs-retest (implementation complete)
- **Decision / evidence:** Same live scale/size clamp on the vertical axis. Same group verification as BUG-002. **No device verification claimed.**
- **Next:** pinch + vertical drag on tall/short/partially loaded images.

### [ ] BUG-006 — Embedded video frozen after lock/unlock

- **Status:** needs-retest (implementation complete)
- **Decision / evidence:** Recovery waits for **AppState `active` + `shouldPlay`**, then a **bounded reload**. Same group verification as BUG-002. **No device verification claimed.**
- **Next:** lock/unlock during play/pause on iOS and Android.

### [ ] BUG-007 — App randomly restarts after 1–2 min background

- **Status:** needs-retest (implementation complete; **process-death residual**)
- **Decision / evidence:** Same-runtime route remount **no longer reanchors Home**. **OS process death may still cold-start Home** — that residual remains. Same group verification as BUG-002. **No device verification claimed.**
- **Next:** Android 1–2 min background under normal and memory pressure; record process-kill (may still land on Home) vs same-runtime restore.

### [ ] BUG-008 — Daily Quest counter increments on cancelled likes

- **Status:** backend / external (retired feature)
- **Decision:** Quests/rewards are **retired in node v1.39** (410 routes, schema removed). Mobile must **not fake unlike reversal**. If quests return, the backend must net `direction-0` / vote changes. Not a mobile counting bug.
- **Evidence:** client only rendered server `daily_quests`; node no longer serves the feature.
- **Next:** backend/product only — restore quests with netted vote reversals, or leave retired. No mobile implementation.

### [ ] BUG-009 — Moderation banner reappears after “Remind me later”

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Snooze/dismiss is wallet-keyed with **normalized keys** and orchestrator **order** (adult then moderation). Group verification (BUG-009/012/016/018/020/021/032/033/037/038): **103 focused tests**; ESLint, navigation, stores passed; architecture component checks passed. **No device verification claimed.**
- **Next:** “Remind me later”, restart, then retest before/after snooze expiry. Account-switch too.

### [ ] BUG-010 — Cross-device feed delay after publishing

- **Status:** backend / external (by-design 30s discovery)
- **Decision:** Focused new-post discovery/banner is **by design at ~30s**. No platform request divergence. Instant cross-device appearance needs **indexer latency / push**, not a mobile poll change.
- **Evidence:** client polling/banner path; requests are not iOS-vs-Android specific.
- **Next:** backend/indexer or push if product wants faster than 30s. Optional: confirm ~30s banner on both devices.

### [x] BUG-011 — Notification unread state does not sync per item across devices

- **Status:** accepted / resolved (node-limited)
- **Decision:** Node exposes account-level `POST /api/mark_inbox_viewed` only. Mobile already calls it on inbox focus. Per-reply IDs are **local by node limitation**. Do **not** build a per-item cross-device sync feature.
- **Evidence:** `src/api/write/endpoints/inbox.ts:10-18`; inbox focus calls `markInboxViewed` — `src/pages/inbox/use-inbox-controller.ts:239-252`; local per-reply IDs — `src/stores/inbox-store.ts:68-83`.
- **Next:** optional only — confirm inbox-level unread/badge clears on device B after A opens inbox. Not required to close this ID.

### [ ] BUG-012 — “New Posts” banner tap does not refresh the feed

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Banner press uses a **serialized refresh** so an in-flight pull no longer drops the tap. Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** tap during an in-flight pull-refresh and on slow network.

### [ ] BUG-013 — “Days in App” tenure updates hours late

- **Status:** needs-retest (fixed in code)
- **Decision:** Tenure was frozen by a memoized `Date.now`. Shared elapsed formatter now ticks with time. Mobile units are correct; remaining check is live clock vs server timestamp.
- **Evidence:** audit group **25 tests**. Runtime group verification: **87 focused tests**; focused ESLint/navigation/store checks passed. **No device verification claimed.**
- **Next:** current-build retest across the 24h boundary and shortly after signup.

### [x] BUG-014 — Profile “Reserve” balance appears frozen

- **Status:** accepted / by-design (copy corrected)
- **Decision:** Reserve is **locked subscription escrow**, not interaction or gas balance. Expectation mismatch, not a frozen counter. Explanatory copy was updated accordingly. Do not treat post create/delete as a reserve delta.
- **Evidence:** server `reserve_funds` semantics; copy updated to describe escrow.
- **Next:** none. Do not reopen as a mobile balance bug.

### [x] BUG-015 — “Perks” missing on iOS side menu

- **Status:** accepted / by-design
- **Decision:** Perks is MIRAGE-token subscription management and is **intentionally hidden on iOS** for App Store / IAP compliance. Not a parity bug.
- **Evidence:** `hideOnIos: true` — `src/features/side-menu/side-menu-model.ts:29-38`; renderer — `src/features/side-menu/side-menu-content.tsx:61`.
- **Next:** none. Do not unhide on iOS without a Store-safe IAP redesign.

### [ ] BUG-016 — Referral link generate/copy fails

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Referral URL is **encoded**; copy and share report explicit success/failure outcomes. Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** generate, copy, paste, share on both platforms; validate signup URL, not only clipboard success.

### [x] BUG-017 — NSFW / 18+ filter does not sync across devices

- **Status:** accepted / resolved (no account-sync API)
- **Decision:** Adult-tag **display filters are local-only on mobile and web**. Node has no account-level preference sync; requests only send `allowed_tags`. Do not invent a mobile-only sync protocol.
- **Evidence:** local Zustand — `src/stores/preferences-store.ts:145-160`, `:193-209`; request param — `src/api/read/request-params.ts:18-24`, `src/services/bootstrap.ts:71`.
- **Next:** none for sync. If product later wants account sync, that is a node API.

### [ ] BUG-018 — “BALANCE … MIRAGE” header not tappable

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Balance remains pressable; **close-then-`/profile`** path preserved (with BUG-036). Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** confirm press opens Profile. Wallet screen is out of scope until it exists.

### [x] BUG-019 — iOS vs Android main-feed ordering differs

- **Status:** accepted / by-design (personalized feed)
- **Decision:** Magic ranking uses **wallet seen-state** and local `allowed_tags`. Requests are **not platform-specific**. Different devices can legitimately show different order.
- **Evidence:** personalized/backend feed contract; no iOS-vs-Android request fork.
- **Next:** none. Do not force identical cross-device ordering.

### [ ] BUG-020 — Haptic vibration on tapping plain post body text (iOS)

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** **Inert haptic gate** — no vibration when the card has no action. Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** tap inert detail body text (no haptic) vs tappable feed cards (haptic + navigate).

### [ ] BUG-021 — “New Posts” banner appears over post detail

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Banner remains **focus-gated** so it does not overlay post detail. Same 103-test group verification as BUG-009. **No device verification claimed.**
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

- **Status:** needs-retest (implementation complete)
- **Decision:** Centralized **active** reward-summary refetch after successful qualifying **post / comment / vote / follow** writes. Unfollow/edit/delete and failed writes do not refetch. Votes refetch only on mutation success, not button press. No delayed polling.
- **Evidence:** Centralized helper `src/api/cache/reward-summary-cache.ts` wired from post/follow/vote write hooks. Verification reported: **12 focused tests**. **No device verification claimed.**
- **Next:** current-build retest: complete a daily quest action on Home and confirm the header count updates without opening Quests.

### [ ] BUG-026 — Login cooldown bypassed by backgrounding the app

- **Status:** blocked on protocol (do not implement)
- **Decision:** **No login cooldown exists.** Local BIP39 import does not call the node, and there is no `Retry-After` / absolute expiry. Do **not** create a fake local timer.
- **Evidence:** login is local mnemonic import; no client cooldown state.
- **Next:** backend/protocol only — if a cooldown is required, the node must return an absolute expiry. No mobile timer.

### [x] BUG-027 — Guest feed stuck at ~5 static posts / slow images

- **Status:** deferred (product decision)
- **Decision:** Product deferred guest-feed work. Do **not** implement a public logged-out feed until product reopens it. No mobile implementation in this pass.
- **Evidence:** logged-out home fetches welcome stats/node config, not a public post-feed query — `src/pages/home/logged-out-home-content.tsx:33-50`.
- **Next:** none unless product reopens guest feed as a requirement.

### [ ] BUG-028 — Downvotes hide posts / vote state lost on refresh

- **Status:** needs-retest (expected backend feed contract)
- **Decision:** Newest/magic feeds **deliberately omit viewer-downvoted posts after refresh**. Profile / direct view should **retain the vote**. Not a mobile hide-filter implementation.
- **Evidence:** backend feed contract; client default does not locally hide downvoted posts.
- **Next:** device **contract** retest — downvote in feed, refresh (post omitted), open profile/direct (vote retained). No mobile implementation.

### [ ] BUG-029 — Admin / moderation selection sync delay across devices

- **Status:** backend / external (partial mobile fix)
- **Decision:** Followed-list `staleTime` reduced **24h → 60s**; foreground recovery now includes followed/blocked. True **agent selection sync** still needs backend/product: node v1.39 **retired persistent agent selection**.
- **Evidence:** media source/follow/account group **39 focused tests**. **No device verification claimed.**
- **Next:** backend/product — restore persistent agent selection if cross-device admin choice is still required. Optional: confirm 60s followed-list freshness.

### [ ] BUG-030 — Severe lag after 15+ minutes of use

- **Status:** needs profiling (partial fix)
- **Decision:** Unbounded seen-post exposure map is now **pruned/capped at 256**. A 15-minute FPS/memory regression still cannot be closed without a device profile.
- **Evidence:** runtime group **87 focused tests**; focused ESLint/navigation/store checks passed. **No device verification claimed.**
- **Next:** Instruments / Android Studio over a **20–30 min** mixed-media session.

### [ ] BUG-031 — Tenure shows “2 minutes” immediately after signup

- **Status:** backend / external (mobile units correct)
- **Decision:** Mobile elapsed units are correct (shared formatter with BUG-013). Immediate “2 minutes” is **server timestamp or clock skew**, not a client offset bug.
- **Evidence:** added immediate / 120s / millisecond boundary tests in the tenure audit group (**25 tests**). **No device verification claimed.**
- **Next:** capture raw registration timestamp vs device time immediately after signup. Backend if the stamp is already ahead.

### [ ] BUG-032 — Create Post keeps previous title/category

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Successful publish **resets to an empty draft**. Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** publish, immediately reopen Create, confirm empty fields before queue completion.

### [ ] BUG-033 — Multi-image posts cropped / misaligned

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Mixed gallery is **measured and centered**. Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** 3+ mixed portrait/landscape in feed and detail. Visual-only; code cannot prove native layout.

### [ ] BUG-034 — Moderation modal dismisses on Android scroll / nav-bar gesture

- **Status:** needs-retest (fixed in code)
- **Decision:** Adult/moderation prompts are **explicit-action-only** and **not dismissible** by pan / backdrop / back / scroll. Moderation is a **safe-area modal**.
- **Evidence:** runtime group **87 focused tests**. **No device verification claimed.**
- **Next:** gesture-nav and 3-button Android: scroll, back, backdrop — prompt stays until an explicit choice.

### [ ] BUG-035 — Interacting in post detail kicks back to main feed

- **Status:** needs-retest (fixed in code)
- **Decision:** Only **deliberate expanded-media swipe** leaves the post. Post-detail **stack swipe is disabled**.
- **Evidence:** runtime group **87 focused tests**. **No device verification claimed.**
- **Next:** open post detail, interact (scroll, prompts, refresh) without leaving; confirm only expanded-media swipe pops.

### [x] BUG-036 — Side menu stays open after tapping Balance

- **Status:** resolved
- **Decision:** Balance now **closes the side menu before** navigating to `/profile`.
- **Evidence:** `dismissThenNavigate(close, …)` — `src/features/side-menu/use-side-menu-controller.ts:228-233`; destination `/profile` — `src/features/side-menu/side-menu-model.ts:182-187`. Verified by **5 focused unit tests** in `tests/side-menu-controller.test.ts` (including “opens balance on profile after dismissing the overlay”). **No device verification claimed.**
- **Next:** none required. Optional smoke: open menu → tap Balance → overlay gone, Profile visible.

### [ ] BUG-037 — Shared profile/referral link opens the local user instead of the target

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Shared links resolve to the **target user** on warm and cold start. Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** copy Account A profile link, open while logged in as B; warm and cold start.

### [ ] BUG-038 — Low contrast on Following / Topics tab in dark theme

- **Status:** needs-retest (code/test hardened)
- **Decision / evidence:** Dark theme uses the contrast token **without opacity dim**. Same 103-test group verification as BUG-009. **No device verification claimed.**
- **Next:** measure dark-theme contrast on device. Token use ≠ WCAG proof.

### [ ] BUG-039 — Reddit-extracted video quality is severely compressed

- **Status:** needs-retest (implementation complete)
- **Decision:** Reddit source picker now prefers **reported-height DASH**. Upload transcode is **source-based**, **no upscale**, up to **1920 long side / 4 Mbps**, with long-form caps. Unknown dimensions keep the fallback.
- **Evidence:** media source/follow/account group **39 tests** + **9 upload-quality tests**. Focused ESLint/navigation/store checks passed. **No device verification claimed.**
- **Next:** current-build upload/playback retest of a high-quality Reddit video vs original.

### [ ] BUG-040 — Anti-spam bot applies duplicate tags

- **Status:** backend / external (bot)
- **Decision:** Mobile cannot fix bot tagging. Node v1.39 **retired agent edits**. Recommend **idempotency key per post/action** or remove the duplicate bot path.
- **Evidence:** no mobile bot executor.
- **Next:** node/bot owners — idempotency or removal. No mobile work.

### [ ] BUG-041 — Cold-launch “screen wobble” / delayed first paint

- **Status:** needs-retest (wobble sources reduced)
- **Decision:** Removed **mount scroll-to-top**, use **initial safe-area metrics**, and present the adult sheet on the **next frame**. Residual wobble may still exist; do not claim runtime-closed.
- **Evidence:** runtime group **87 focused tests**. **No device verification claimed.**
- **Next:** slow-motion cold launches on iOS and Android; note any remaining layout shift.

---

## Checkbox summary

| Remaining work `[ ]` | No remaining mobile work `[x]` |
|---|---|
| Deferred: 001, 027 | Accepted / by-design: 011, 014, 015, 017, 019, 022 |
| Open implementation: — | Resolved: 036 |
| Needs-retest: 002, 003, 004, 005, 006, 007, 009, 012, 013, 016, 018, 020, 021, 023, 024, 025, 028, 032, 033, 034, 035, 037, 038, 039, 041 + TRACK-TOPIC-SEARCH-CASE | |
| Profiling: 030 | |
| Backend / product / protocol: 008, 010, 026, 029, 031, 040 | |

## Remaining next actions

**Device retest (current build, still unchecked):**
- BUG-002–007 (003/007 still have process-death residuals)
- BUG-009, 012, 013, 016, 018, 020, 021, 023, 024, 025, 032, 033, 034, 035, 037, 038, 039, 041
- BUG-028 feed-contract: downvote omitted after refresh; vote retained on profile/direct
- TRACK-TOPIC-SEARCH-CASE (`News`, `  NEWS  `, `#Topic`)

**Profiling:**
- BUG-030 — 20–30 min mixed-media session (seen-map now capped at 256)

**Backend / product:**
- BUG-008 — quests retired in node v1.39; if restored, net `direction-0` votes
- BUG-010 — instant cross-device needs indexer/push; 30s discovery is by design
- BUG-026 — no login cooldown protocol; do not fake a local timer
- BUG-029 — persistent agent selection retired in v1.39; restore if product still wants it
- BUG-031 — capture raw signup timestamp vs device clock
- BUG-040 — bot idempotency or removal (agent edits retired)

**Deferred:**
- BUG-001 — wait for legal URLs
- BUG-027 — guest feed deferred by product

Verification reported by implementation agents (not re-run here): runtime group 87 focused tests; media source/follow/account 39; upload quality 9; focused ESLint/navigation/store checks passed. Full-suite/architecture runner still has one unrelated pre-existing `tests/server-runtime.test.ts` failure from `queryKeys.redgifsMedia(undefined)`.
