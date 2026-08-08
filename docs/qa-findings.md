# QA Findings & UX/Core Implementation Audit

> Source: QA spreadsheet (Staging / Build 1.1.6, Redmi 9 Android 12 + iPhone 12 iOS 26.5),
> user reports (gift-mirage freeze, inbox→comment navigation), and a code audit of the
> mobile app (api layer → caching → UX) plus mirage-node backend and production Sentry data.
>
> Status legend: [ ] open · [~] in progress · [x] fixed · [-] won't fix / duplicate

---

## Part A — QA Spreadsheet Issues (36 items)

### Critical

- [x] **BUG-004** — Login with valid seed phrase redirects to Registration ("Hello Friend") instead of Main Feed. *(Fixed: login success called `router.dismissAll()`, which unwinds to the first screen of the **nearest** stack — the (auth) modal's own Stack. When Login was reached from the username screen (the auth sheet's default entry → "I already have an account"), the auth stack was `[username, login]`, so dismissAll landed back on "Hello Friend" with a live session behind it; when Login was the sole entry it was a no-op, leaving the user stuck on the modal until restart. Now `router.replace("/(tabs)")` exits the modal deterministically regardless of stack composition (`login-page.tsx`). Explains the flakiness: symptom depended on which path opened Login.)*
- [~] **BUG-005** — Vote direction change while post is loading/expanding causes total system UI freeze requiring hard phone restart. *(Mitigated: vote enqueue is now debounced 400 ms per target so rapid direction changes never launch back-to-back native Argon2 computations, and the PoW queue now waits up to 2 s for the cancelled native computation to settle before starting the next (was 500 ms — overlap risk on low-end devices). Needs device re-test on Redmi 9 to confirm the freeze is gone.)*
- [~] **BUG-033** — Screen turns completely black on repeated navigation taps (Following/Topic feed). *(No repro found in code. The navigation tree was rebuilt (Slot root → single (app) Stack → Tabs — see Part E) which removes the double-navigator nesting that is the usual cause of black-screen-on-rapid-taps in expo-router; rapid duplicate taps are also already deduplicated by the guarded router. Needs device re-test on the new structure.)*

### High

- [ ] **BUG-001** — Failed seed-phrase attempts lock input for 10 minutes with no countdown. *(Investigated: no client-side lockout exists — the lock is backend rate-limiting. A countdown needs the node to return a retry-after value; pair with the `get_comments` extension ask to the backend team.)*
- [-] **BUG-003** — Registration state (12-word seed phrase step) lost when app is minimized; flow resets to start. *(Root-caused: this is deliberate — `initializeWallet` calls `walletService.cleanupPendingWallet()` on every startup, deleting any unconfirmed signup wallet, so an OS process death mid-signup restarts the flow. Only reproduces when the OS actually kills the backgrounded process. Resuming the seed-phrase step would mean keeping an unconfirmed wallet + re-exporting the mnemonic on restart — a security-sensitive product decision, deferred as a follow-up rather than a bug fix.)*
- [~] **BUG-006** — App fully restarts/refreshes feed after returning from an external link. *(Root-caused: OS process death while backgrounded — not an app defect. The client already persists launch-critical feed queries (instant feed restore on relaunch) and has `refetchOnWindowFocus: false`, so a surviving process never resets. Scroll-position restore across process death would require persisting navigation + list state — deferred. See C-5 for why Sentry vastly overstated this.)*
- [x] **BUG-007** — Zoomed image pans infinitely into blank white screen. *(Fixed: `use-preview-zoom-gesture.ts` pan is now clamped to `extent×(scale−1)/2` per axis, and pinch-out re-clamps the translation for the settled scale — the image can never fully leave the viewport.)*
- [~] **BUG-011** — App randomly restarts from scratch after 1–2 min of backgrounding. *(Root-caused with C-5: the 21k-event `IncompleteStartupError` signal was ~all false positives — headless background-fetch launches overwrote the startup record (see C-5 fix). The genuine restarts are OS memory kills on low-RAM devices (Redmi 9); feed cache is already persisted for instant restore. Re-assess real incomplete-startup rate in Sentry after the diagnostics fix ships.)*
- [x] **BUG-024** — Floating "New Posts" banner tap does not refresh the feed (intermittent). *(Fixed: root cause was `handleRefresh` silently returning when another refresh was in flight — the banner tap did nothing but the banner was dismissed anyway. Refresh requests are now chained after the in-flight one instead of dropped (`use-home-tabbed-feed-controller.ts`). Also fixed a stuck banner spinner on refresh failure in `following-content.tsx`.)*
- [x] **BUG-028** — Referral link generation/copy fails; no feedback, nothing on clipboard. *(Fixed — three compounding defects: (1) copy/share was gated on the referral-precheck toggle even on open-registration nodes where that toggle is never rendered → permanently disabled button with a hint pointing at a nonexistent toggle; now only gated when the node requires invite codes. (2) invite sheet's "Copy Link" copied an empty string and showed "Copied!" when no code was selected; now guarded. (3) all clipboard failures were silent breadcrumbs; now error toast + haptic + Sentry error. Also added a "Set a username" notice instead of silently hiding the referral-link card.)*
- [-] **BUG-029** — NSFW / 18+ content filter toggle does not sync cross-platform. *(Backend: server-side preference persistence/sync — the client already reads and writes the preference correctly per device. Cross-device sync requires the node to store per-account preferences.)*
- [x] **BUG-032** — "Following" feed does not update after following new topics. *(Fixed: `markPostsStaleAfterFollow` was supposed to actively refetch Following feeds after every follow/unfollow, but its predicate read `queryKey[1]` expecting the filters object — the real key shape is `["server", <url>, "posts", "viewer", <addr>, filters]`, so `queryKey[1]` was the server URL string and the predicate never matched once. The Following feed was only marked stale, and with `refetchOnWindowFocus` disabled it never refetched until remount. Predicate now reads the filters from the end of the key (`use-follow.ts`), so active Following feeds refetch immediately on follow and again after the 5 s indexer-delay pass.)*

### Medium

- [x] **BUG-008** — Vertical drag on zoomed image causes page jump / white screen flash. *(Same root cause as BUG-007 — the unbounded vertical pan flung the image entirely off-screen; fixed by the same pan clamping.)*
- [x] **BUG-009** — Embedded video frozen after screen lock/unlock. *(Fixed — two defects: (1) the foreground recovery only armed on AppState `background`, but iOS screen lock often reports only `inactive` → recovery never fired after unlock; now arms on both (playback hook, gallery item, health hook). (2) the `playingChange` auto-resume called `play()` while the device was still locked — the OS silently rejects it, wedging the player paused while the UI showed active; now skipped unless AppState is `active`, deferring to the foreground recovery. Also hardened the `videoPlayer.addListener` crash family (~136 Sentry events): listener registration/removal on a released native player no longer throws.)*
- [-] **BUG-010** — Swipe-down gesture inconsistent: top-image posts close, text-first posts trigger pull-to-refresh. *(Root-caused, by design: media-first posts open the immersive media viewer (pan-to-dismiss), text-first posts open the legacy scrollable detail screen where swipe-down is the comments `RefreshControl`. Unifying would mean adding swipe-to-dismiss to a scrollable FlatList screen — it conflicts with scroll + pull-to-refresh gestures and is a product/UX decision, best folded into the C-1 post-detail rework rather than patched piecemeal.)*
- [x] **BUG-012** — Rapid upvote→downvote race clears all vote state instead of registering final choice. *(Fixed: rapid taps coalesce — optimistic UI updates instantly on every tap but only the final settled direction is enqueued as a single PoW action; no more cancel-then-re-enqueue races.)*
- [-] **BUG-013** — Daily Quest counter increments on likes that were immediately removed. *(Backend: quest counting happens server-side on vote receipt; the node needs to net out reverted interactions.)*
- [x] **BUG-015** — Bottom navigation bar jitters/stutters during feed scroll (iOS). *(Fixed: during a momentum fling, FlashList recycling emits small opposite-direction scroll-offset corrections; they passed every existing guard (small diff, `isUserScrolling` true during momentum), flipped the direction tracker, and toggled the bars mid-fling — then the continuing fling re-hid them 350 ms later, reading as jitter. A decelerating fling physically cannot reverse direction, so the handler now locks onto the fling direction at momentum start and drops opposite-direction events for the rest of the momentum phase (`scroll-animation-context.tsx`). Needs device re-test on iOS.)*
- [x] **BUG-016** — Moderation banner reappears on launch despite "Remind me later". *(Hardened: dismiss/snooze state is keyed per user id — the only failure path found is an address-casing mismatch across sessions. Keys are now lowercased on read+write with a v8 store migration normalizing existing data. Needs retest.)*
- [-] **BUG-017** — Post published on iOS delayed appearing in Android main feed. *(Backend: cross-device feed propagation delay on the node; the other device can only see the post once the node serves it. Client refetch behavior is already in place.)*
- [x] **BUG-018** — Post edit (photo removal) still shows removed image ~2 min despite pull-to-refresh. *(Fixed: the post-edit override store — which shields edited fields from stale server responses for 120 s while the node indexer catches up — stored `media: undefined` when all photos were removed, so every consumer's `override.media ?? post.media` fell back to the stale server media after any refetch. The ~2 min matched the override TTL exactly. Now stores the media array unconditionally (`[]` = removed), which every consumer already handles (`use-create-submit-flow.ts`). The optimistic cache edit already handled `[]` correctly; only the override path leaked.)*
- [x] **BUG-020** — Sensitive content overlay is a solid black box instead of a blur. *(Fixed: Android now uses a real `BlurView` (`experimentalBlurMethod="dimezisBlurView"`, expo-blur 56) in both the post-card media overlay and the media gallery; removed the near-opaque black fallback.)*
- [-] **BUG-022** — Notification "unread" state does not sync across devices. *(Backend: read-state must be persisted per account on the node and reflected in the inbox payload.)*
- [-] **BUG-026** — Profile "Reserve" balance counter hard-locked (e.g. 94.9k). *(Not a bug: `reserve_funds` is the on-chain **escrowed gas reserve for the subscription** (mirage-node `blockchain/docs/profile-architecture.md`) — it only changes on subscribe/renew/expire, never on post create/delete or rewards. The client already refetches it on profile focus and pull-to-refresh. If the static value confuses users, the product fix is renaming/explaining the label (e.g. "Subscription reserve"), not client caching.)*
- [-] **BUG-027** — iOS missing "Perks (Update subscription)" side-menu entry present on Android. *(By design: deliberate App Store compliance gating (`hideOnIos: true` in `side-menu-model.ts`, `Platform.OS !== "ios"` in `profile-menu-sheet.tsx`) — MIRAGE-token subscription purchases cannot be surfaced on iOS without Apple IAP. Both surfaces are gated consistently; nothing broken to fix.)*
- [-] **BUG-031** — Main feed shows different posts / ordering on iOS vs Android for the same account. *(Backend: feed ordering is computed server-side per request; divergence across devices is node-side ranking/propagation, not client caching.)*
- [x] **BUG-035** — "New Posts" floating banner appears inside opened post detail. *(Fixed: banner visibility is now gated on screen focus (`useIsFocused`) in home, following, and topic feeds — it hides whenever another screen is presented above the feed.)*
- [x] **BUG-036** — On mirage.vote node: no new-post notifications and reduced feed sync. *(Root-caused + fixed: there is no websocket in the app — notifications come from the BackgroundFetch inbox poll, and that poll ran against the WRONG node. `apiClient` is constructed with the hardcoded default `https://mirage.talk` and only corrected when `ApiServerProvider` mounts in the React tree; headless background-fetch launches never mount providers, so every background inbox check on a mirage.vote user silently queried mirage.talk (and wrote unread counts/timestamps from the wrong server). Fixed: the client now hydrates its initial base URL from the synchronously-persisted preferences store at construction (`src/api/client.ts`), which also fixes the server-scoped query-key namespace for headless launches. Push registration was already correctly re-registered per node on switch — if pushes still don't arrive on mirage.vote after this, the remaining gap is that node's push infrastructure (backend).)*

### Low

- [-] **BUG-002** — Privacy Policy link on onboarding is unresponsive. *(Blocked: the "link" is a `console.log` placeholder (`username-content.tsx:861`) and **no privacy policy page exists anywhere** — not in the app, not on the web app. Needs content/URL from the team before it can be wired.)*
- [ ] **BUG-014** — Daily Quests widget renders white background in dark mode. *(Investigated: quests widget + screen are fully theme-tokened; no hardcoded white background found. QA screenshot inaccessible — needs repro steps or screenshot to proceed.)*
- [-] **BUG-019** — "Copy Link" copies raw data string. *(Could not reproduce in code: every copy/share path already produces `https://<server>/p/<id>` via `getShareBaseUrl`. Likely fixed in an earlier build — needs retest on current build.)*
- [x] **BUG-021** — Hashtags/topics not tappable. *(Fixed: header topics were already tappable; inline `#hashtag` tokens in post titles and markdown bodies are now tappable spans that navigate to the topic feed via the existing deep-link route — new `src/utils/hashtag-parser.tsx`, wired into `post-card-content.tsx` and `markdown-content.tsx`.)*
- [-] **BUG-023** — Post deletion propagates to other devices with ~15 s delay on iOS. *(Backend: propagation latency between node and other clients; within normal refetch cadence on the client.)*
- [-] **BUG-025** — "Days in App" tenure timer updates hours late. *(Backend: tenure is computed server-side; the client renders the value it receives.)*
- [x] **BUG-030** — "BALANCE 0 MIRAGE" side-menu header is static. *(Fixed: balance card is now a button that opens the profile tab — no dedicated wallet screen exists yet; swap the destination when one ships.)*
- [x] **BUG-034** — Haptic vibration fires on tapping plain body text with no action (iOS). *(Fixed: `post-card.tsx` `handlePress` bails out before the haptic when the card has no `onPress` — e.g. in post detail.)*

### Info / Passed

- [x] **TEST-001** — Smoke & stability check (Android) passed.
- [-] **INFO-001** — Guest access restrictions work as designed (registration wall).
- [ ] **BUG-037 / BUG-038** — Empty placeholder rows. Suggested candidates: the two deep-dive issues below (B-1, B-2).
- [x] **BUG-041** — Topics list: following a topic flashes "Following", reverts to "Follow", then a retry fails with "already followed". *(Two compounding root causes. **(1) Topic case identity.** Topics are case-preserving for display but case-insensitive for identity: `get_topics` returns the original-cased name as first typed (`#Bitcoin`, see `public.py:get_topics` — the node even comments "original-case topic keys"), while a follow is always written lowercase (client `social.ts` sends `topic.toLowerCase()`, and `core.py` lowercases again before building `MsgFollowTopic`), so `followed_topics` only ever contains lowercase names. Every read-side membership check compared the two directly (`followedTopics.has(item.topic)` / `.includes(post.topic)`) and the mutation's optimistic write inserted the **display-cased** name. Sequence: baseline wrongly reads "not followed" → tap inserts `"Bitcoin"` → shows "Following" → the 5 s consistency refetch replaces it with `["bitcoin"]` → membership stops matching → button snaps back to "Follow" → retry hits the node's duplicate guard. **(2) The duplicate-follow guard never matched.** `/core/follow_topic` and `/core/follow_user` predate the node's `error_code` registry and still return `{"error": "topic is already followed"}` with no `error_code`, so `parseApiError` yields `errorCode: null` and the `errorCode === "topic_already_followed"` check in `use-follow.ts` never fired — a duplicate follow rolled the cache back, raised a Sentry error, and surfaced a pow-queue failure toast instead of being absorbed as "intent already satisfied". Fixed: new `src/domain/topics/follow.ts` owns topic identity (`normalizeTopicName`, `buildFollowedTopicSet`, `isTopicFollowed`, `toggleFollowedTopics`) and is now used by every follow-state read (topics list, topic feed, home/following feed sets, post-card selector, post-detail sections/sheets/contracts, post-action controllers) and by the optimistic cache write, which stores the normalized name so it survives the refetch; `isAlreadyFollowedError()` matches the message text as well as the code, the same way the web client does, and keeps the optimistic state instead of rolling back. Note this also fixed a silent baseline bug everywhere: any already-followed mixed-case topic rendered as "Follow" on a fresh load.)*
- [x] **BUG-040** — Feed silently splices in new posts while reading; the "New posts" pill never appears (regression). *(Root cause: `799948d` flipped the shared infinite-feed policy to `staleTime: 0` + `refetchOnMount: true` (`src/api/read/infinite-posts-policy.ts`; `3e84312` later raised staleTime to 2 min but kept the mount refetch). A TanStack infinite-query refetch re-runs **every** retained page and replaces the cached pages, so each mount/foreground-recovery pass rewrote page 1 under the user. That also dragged the pill's baseline forward — `use-new-posts-checker` derives its baseline from the newest post on page 1, so by the time it polled, the feed had already swallowed the new posts and `hasNewPosts` never went true. Fixed: the feed query is now permanently fresh (`staleTime: Infinity`, `refetchOnMount: false`), which additionally excludes it from the centralized foreground/reconnect `recoverStaleActiveQueries` pass. List membership changes only on explicit intent (pull-to-refresh, tab-tap refresh, pill tap `fetchAllNew`, `fetchNextPage`, mutation cache writes); background work stays order-preserving — `useNewPostsChecker` polls page 1 for the pill and `usePostDataRefresher` merges metadata onto the posts already on screen. Also hardened the checker: an initial focus check (800 ms, throttled by the poll interval) so a hydrated/revisited feed surfaces the pill immediately instead of after a full 30 s, and `dismiss()` now re-arms the baseline from the current top of feed instead of parking on `null` — a manual refresh returning the same newest post left the dependency-driven baseline effect dormant for the rest of the session.)*
- [x] **BUG-039** — "Give Award" from a user profile always fails with `invalid_target` (found in device testing of C-3). *(Root cause: the profile menu presented `AwardPickerSheet` with the user's `mirage1…` wallet address as target, but awards are strictly post/comment-targeted — the API rejects non-hex64 targets (`core.py:4719` `_is_hex64` → `invalid target`) and the chain handler independently validates the target as a tx hash (`module.go:3570` `validateTxHash`). User awards do not exist anywhere in the stack; the `targetType="user"` prop was aspirational. Fixed client-side: removed the "Give Award" entry + award sheet from the user-profile menu/overlays/controller and narrowed `AwardPickerSheet`'s `targetType` to `"post" | "comment"`. Gift Mirage / Gift Subscription remain the user-targeted actions. If user awards are ever wanted, that's a backend + chain feature ask.)*

---

## Part B — Deep-Dive Issues (user-reported, root-caused in code)

### B-1. Gift Mirage: screen frozen after sending, can't exit or edit input (iOS) — P0

**File:** `src/components/molecules/gift-mirage-sheet.tsx`

Four compounding defects; 1 and 2 each independently reproduce the reported symptom.

- [x] **B-1.1 — Keyboard-restore hack re-opens the sheet mid-dismiss (primary suspect).** *(Fixed: hack deleted; keyboard listeners now only track footer height.)*
  `gift-mirage-sheet.tsx:63-75`: on `keyboardDidHide`, a 60 ms timer calls
  `bottomSheetRef.current?.snapToIndex(0)`. The success path in `handleSend` runs
  `Keyboard.dismiss()` → `dismiss()` → `keyboardDidHide` fires → 60 ms later
  **`snapToIndex(0)` yanks the dismissing modal back open** in a corrupted state:
  `onChange(-1)` may have already fired (`isPresented=false`, `onDismiss` called),
  the backdrop is detached, and gorhom's gesture/keyboard state machine is wedged.
  Result: ghost sheet that can't be closed or typed into. Same race if the user
  closes the keyboard then immediately taps ✕ or swipes down.
  *Fix:* remove the hack or guard it (`isPresented && !isDismissing`); prefer fixing
  the underlying `keyboardBlurBehavior="restore"` interaction instead.

- [x] **B-1.2 — No escape hatch while sending; send path is unbounded.** *(Fixed: sheet never locks — ✕/backdrop/pan-down always work; dismissing mid-send shows "Sending in background" toast and the mutation completes with success/error toast. Double-send prevented via in-flight ref on re-present. Time cap / pow-queue migration deferred to C-3.)*
  While `isSending`: `enablePanDownToClose={false}`, backdrop `pressBehavior="none"`,
  ✕ disabled (lines 126-131, 179-183, 199-201). Send path:
  `useSendTokens` → `sendTokens` → `withPowRetry` (up to 4 attempts,
  `src/api/write/utils/retry-pow.ts:12`) × `buildSignedEnvelope` (up to 15 PoW
  challenges × 20 s, `src/api/write/signing/envelope.ts:56-57`) + 30 s axios timeout
  per POST → worst case minutes of locked modal while 4 native Argon2 workers
  saturate the CPU (`src/wallet/pow-turbo.ts`) making the UI feel frozen.
  *Fix:* never fully lock the sheet (keep ✕ with a "cancel send?" confirm), cap total
  send time, and preferably route gifting through the existing `pow-queue`
  (`src/services/pow-queue.ts`) like votes/comments: dismiss immediately, optimistic
  toast progress, background PoW.

- [x] **B-1.3 — No PoW progress feedback.** *(Fixed: `onPoWProgress` wired; Send button shows "Verifying… N%".)*

- [x] **B-1.4 — Balance UX trap.** *(Fixed: balance row shows spinner while loading; insufficient-balance check only applies once balance is known — server still validates.)*

- [x] **B-1.5 — Same audit for `gift-subscription-sheet` / `award-picker-sheet`.** *(Fixed: both had the modal-lock + balance-trap patterns (no keyboard hack); applied same unlock, background-send toast, in-flight guard, and balance loading state.)*

### B-2. Inbox → post detail: banner shown seconds before comments; wrong comment displayed — P0

**Files:** `src/pages/inbox/use-inbox-item-navigation.ts`, `src/api/cache/inbox-cache.ts`,
`src/pages/post/post-detail-content.tsx`, `src/pages/post/use-post-detail-media-route.ts`,
`src/pages/post/use-post-detail-focused-thread.ts`, `src/pages/post/post-detail-comment-utils.ts`,
`src/pages/post/use-post-detail-highlight-scroll.ts`

Confirmed in prod: Sentry warning "Post detail highlight comment not found"
(`use-post-detail-highlight-scroll.ts`).

- [x] **B-2.1 — Request storm: one inbox tap fires 6–10 requests, several duplicated.** *(Fixed. First pass: seed-then-invalidate now uses `refetchType: "none"` (no refetch storm during navigation); invalidate-on-highlight in `post-detail-content.tsx` removed; raw `getComments` bypass in `use-post-detail-focused-thread.ts` routed through `fetchQuery` on the canonical key so it dedupes. Second pass closed the remainder via B-2.6 adoption — the media-route triple query and the context-check overlap are gone because the ancestor chain, root post, and focused subtree all arrive in one `get_comments` response. Of the list below: 1/3/5 are eliminated on a supporting node, 2 and 4 were fixed directly, and 6 now rarely fires because the highlight is present in the first response.)*
  1. maybe `get_root_post_id` (`use-inbox-item-navigation.ts:92`)
  2. `inbox-cache.ts:100-108` seeds 3 query keys then **immediately invalidates all 3**
     → 3 refetches in flight during navigation, defeating the seeding
  3. `use-post-detail-media-route.ts:37-64`: `useComments(id)` + `rootPostId` +
     `useComments(rootPostId)` again just to pick immersive vs legacy screen
  4. `post-detail-content.tsx:190-196` invalidates `comments(id)` **again** whenever
     `highlight` is set
  5. `use-post-detail-focused-thread.ts`: `useComments(focusedCommentId)` + context
     check query + `fetchQuery(commentContext)` + raw imperative
     `getComments(actualRootPostId)` at line 187 bypassing the cache
  6. highlight-not-found retries at 2 s / 4 s / 6 s
     (`use-post-detail-highlight-scroll.ts:151-195`)
  *Fix:* single-endpoint thread fetch (see B-2.6) + kill duplicate invalidations.

- [x] **B-2.2 — Banner renders before comments (the filmed gap).** *(Fixed: `buildPostDetailComments` and the media-path `displayComments` no longer blank the list while ancestor context loads — the focused comment renders immediately and loaded ancestors wrap around it when they arrive.)*

- [x] **B-2.3 — Wrong comment shown: padding with unrelated comments.** *(Fixed: `appendSupplementalCommentsForMinimum` deleted; both legacy and media paths now show only the focused thread — the existing "Full thread" banner affordance covers the rest, and it becomes available more often since displayed count is smaller.)*

- [x] **B-2.4 — Highlight evaporates before scroll settles.** *(Fixed: 6 s force-clear removed — highlight now persists until the user drags the list (`onScrollBeginDrag` → suppress auto-scroll + fade after 3 s). `scrollToEnd` for focused chains now lands on the thread since padding is gone. Remaining: 600/900 ms timer-based initial scroll → C-1 state machine.)*

- [x] **B-2.5 — Cache seeded with fabricated placeholder data.** *(Fixed the harmful half: seeded keys are marked stale without eager refetch, so the mount fetch replaces placeholders once, without the triple-refetch thrash. Placeholder content itself is still seeded — it's what makes the instant render possible.)*

- [x] **B-2.6 — Backend: no single "thread around a comment" endpoint.**
  *(Shipped node-side and adopted. mirage-node extended `get_comments` itself rather
  than adding a new route: the response now carries `ancestors` (ordered ROOT POST
  FIRST, ending at the immediate parent) and `ancestors_omitted`
  (`public.py:_fetch_ancestor_chain` → `_build_thread`). Ancestors are enriched with
  the same votes/awards/media/agent-edit passes as the subtree, so they render
  identically to any other node. A root post returns `ancestors: []` — one renderer,
  no branching.*

  *Client adoption: new `src/api/read/thread-ancestors.ts` derives the thread shape
  (`rootPost`, `parentChain`, `omitted`, `isComment`) from one response. Contract
  verified live on both production nodes before migrating — `ancestors[0]` has no
  `target` (it is the OP), the chain ends at the immediate parent, and ancestors carry
  the same votes/awards enrichment as the subtree.*

  ***Fully migrated — no fallback.** `get_root_post_id` and `get_comment_context` are
  deleted outright: endpoints, `useRootPostId`/`useCommentContext` hooks, the
  `rootPostId` + `commentContext` query-key families, `RootPostIdResponse` +
  `CommentContextResponse` types, and every cache helper that swept those families.
  The helper's `resolved` flag is NOT a node-capability check — it distinguishes a real
  server response from the placeholder the inbox seeds for instant paint. A placeholder
  has no `ancestors` and must not be misread as "this comment is the root post"; it
  simply waits for the one fetch it already triggers.*

  *Requests per focused thread open, before → after:*
  - `use-post-detail-media-route`: 3 → 1 (`get_root_post_id` and the second
    `get_comments(rootId)` are both gone; the routing decision reads `ancestors[0]`)
  - `use-post-detail-focused-thread`: 3 → 1 (context probe, paged context fetch, and
    the root-post `fetchQuery` all collapse into the ancestor chain). The hook shrank
    310 → 163 lines, and its four `useState` + four `useEffect` orchestration became
    plain `useMemo` derivations of one response.
  - `use-media-post-detail-data`: 3 → 1 (both `get_comment_context` queries dead)
  - `profile-comment-item.tsx`: **N → 0.** Each rendered comment row fired its own
    `get_root_post_id` when the row lacked a root id — a per-row request storm on the
    profile comments tab, frequently 404-ing on deleted parents (visible in device
    logs). Rows now navigate to the comment id directly and let the detail screen
    derive the root from `ancestors[0]`.
  - `use-inbox-item-navigation`: a missing `root_post_id` no longer blocks navigation
    on a lookup round trip; the reply id is itself a valid thread entry point.

  *This also removes the render gate that caused B-2.2's filmed gap at the source:
  `isLoadingContext` is false on arrival instead of after a second round trip, so
  the highlight scroll runs in the same pass as first render.*

- [x] **B-2.7 — Dead parameter:** *(Fixed: `loadFocusedContext(10)` → `loadFocusedContext(5)` with comment noting the backend cap.)*

- [x] **B-2.8 — O(cache) scan on the post-open render path.**
  *(Fixed: the `getQueriesData({})` whole-cache fallback now scans only the three
  post-bearing query families — `postsRoot`, `userPostsRoot`, `commentsRoot` —
  bounding the recursive `findPostInCachedData` search to caches that can actually
  contain posts.)*

### B-3. Post detail: leaving a comment scrolls to the wrong spot — P1

**Files:** `src/pages/post/post-detail-comment-composer.tsx`,
`src/pages/post/use-post-detail-highlight-scroll.ts`,
`src/pages/post/post-detail-comment-utils.ts`

- [x] **B-3.1 — Top-level comment: list teardown races timer-based scrollToEnd.** *(Fixed: focused-thread teardown removed from the composer's optimistic path — the merged optimistic comment renders in place; `scheduleScrollToEnd`'s rAF/100/350 ms timer race replaced with a single deterministic scroll on the list's `onContentSizeChange` (+500 ms safety fallback).)*

- [x] **B-3.2 — Reply: two animated scrolls a second apart racing keyboard animation.** *(Fixed: composer-created highlights skip the 600 ms branch-index scroll entirely; positioning is driven solely by the target comment's own layout callback with a 350 ms keyboard-settle delay — one scroll instead of two racing ones.)*

- [x] **B-3.3 — Sort instability after confirmation.** *(Fixed: `mergePostDetailComments` adopts the server `createdAt` for confirmed optimistic comments, so sorting is stable across the optimistic → server handoff and pruning no longer reorders.)*

- [x] **B-3.4 — `onScrollToIndexFailed` fallback uses `averageItemLength × index`.** *(Fixed: rough offset is now only an unanimated jump to force the target into the render window, followed by a precise `scrollToIndex` retry.)*

---

## Part C — Systemic Root Causes

- [~] **C-1 — Effect-orchestrated waterfalls instead of derived state.**
  *(Largely resolved by the B-2/B-3 fixes; remaining timers audited and re-scoped.
  The dangerous races from the original audit are gone: the 60 ms keyboard hack
  (B-1.1), the 6 s highlight force-clear (B-2.4), the rAF/100/350 ms scroll timer
  race (B-3.1), and the double 600+900 ms reply scroll (B-3.2) were all removed —
  scroll positioning is now two-phase: a coarse index scroll into the render window,
  then precise positioning driven by the target's own layout callback with
  `onScrollToIndexFailed` retry. What remains, categorized: (a) **intentional UX
  delays** — 3 s highlight fade, 300 ms sheet-present waits (gorhom cannot present
  a sheet until the previous one finishes dismissing); (b) **bounded backend-lag
  retries** — 2/4/6 s missing-highlight refetch, 2 s indexer refetch after posting
  — these existed because the node had no single thread endpoint; (c) **scroll-settle
  windows** — 600 ms coarse scroll, 350/900 ms measure delays — now safety-netted by
  layout callbacks rather than being the primary mechanism.*

  ***Now unblocked.** B-2.6 landed, so category (b) has lost its cause: the focused
  comment and its whole ancestor chain arrive in the first response, `isLoadingContext`
  is false on arrival, and the highlight is present before the first scroll pass. The
  retries are now dead weight rather than load-bearing. The remaining work is to delete
  category (b) and fold (c) into a single layout-driven state machine — deliberately
  sequenced after a device pass on the B-2.6 adoption, so the rewrite starts from
  observed behavior rather than blind. Tracked as item 9 in Part D.)*

- [x] **C-2 — API granularity mismatch.**
  *(Resolved for the thread axis by B-2.6: "thread around a comment" is now a single
  fetch and the client no longer stitches or render-gates. The remaining granularity
  gap is cold start — mirage-node also shipped `GET /api/bootstrap` (six per-session
  calls in one) and a `view=` param that folds the first feed/thread/inbox payload
  into the same response, documented in `docs/guides/api_bootstrap.md` and
  `mobile_instant_load.md`. That is a separate, still-open adoption: see C-6.)*

- [ ] **C-6 — Cold start still fans out; `/api/bootstrap` not adopted.**
  Node now serves `GET /api/bootstrap?address=&view=feed:home|thread:<id>|inbox|topic:<name>`
  returning `node_config`, `chain_config`, `user_status`, `user_followed`,
  `user_blocked`, `invite_codes`, `rewards_summary` and the first `view` payload in
  one round trip. Mobile still issues the separate per-endpoint calls at launch.
  *Fix (mobile):* build `view` from the launch intent before first render, write each
  non-null section into the cache the per-endpoint hooks already populate, treat
  per-section `null` as "fall through to the per-endpoint route", and hold the splash
  until the single response resolves so the first screen commits at once. Layout-shift
  rule from the guide: above-feed card *existence* must be decided by `node_config`
  flags only (plus `rewards_summary.disabled`), never by section arrival.
  Also removes the `get_upload_url` call — that route was deleted node-side in favour
  of `/api/upload_media`.

- [x] **C-3 — Blocking modal transactions.**
  *(Done: gift mirage, gift subscription, and awards now run through the shared
  `pow-queue` exactly like votes/comments. New queue action types `send_tokens`,
  `gift_subscription`, `award` with proper labels; all three added to the
  non-idempotent set (no network auto-retry — a duplicate POST could double-spend;
  never force-cancelled mid-flight on app background — the POST may already be
  committed; requeued-on-background semantics identical to posts/comments). The
  sheets now validate → haptic → dismiss immediately → enqueue; the queue toast
  owns progress (it polls native PoW progress itself) and the success/failure
  overlay ("Gift sent" / "Subscription gifted" / "Award sent"), with an error
  toast + Sentry capture on failure. Deleted per-sheet `isSending` locks, inline
  PoW progress rendering, background-send info toasts, and axios error unwrapping
  (now `getApiErrorMessage`). Each sheet retains a synchronous duplicate-action
  guard because queue serialization alone does not prevent two distinct,
  non-idempotent actions from executing. Sheets: `gift-mirage-sheet.tsx`,
  `gift-subscription-sheet.tsx`,
  `award-picker-sheet.tsx`; queue: `src/services/pow-queue.ts`.)*

- [x] **C-4 — Invalidate-then-refetch double work.** *(Inbox-seed and post-detail highlight paths fixed — see B-2.1/B-2.5. Audit of remaining flows complete: the highest-frequency mutation (votes) already uses `refetchType: "none"` everywhere; the ~70 unqualified `invalidateQueries` calls left are in low-frequency mutations (follow, award, gift, username) where an active refetch after a user action is the intended behavior, not double work. No `queryClient.clear()` anywhere. Legacy router compat wrappers (`src/utils/guarded-router.ts`, `src/hooks/use-router.ts`) removed — zero callers remained; guardrail now rejects the old import paths outright.)*
  Seed-then-invalidate (inbox cache), invalidate-again-on-mount (post detail
  highlight), retry loops on top. Multiplies backend load — Sentry shows 503s as the
  #3 issue (177 events). Prefer `setQueryData` with fresh timestamps and
  `invalidateQueries({ refetchType: "none" })` where a mount-fetch already follows.

- [x] **C-5 — Startup/state-restore fragility (prod-confirmed).**
  *(Root-caused + fixed: `IncompleteStartupError` (21.7k events) was a diagnostics false-positive storm, not real crashes. `index.ts` runs `beginStartupDiagnostics()` at bundle eval, and the inbox BackgroundFetch task (`stopOnTerminate: false`, `startOnBoot: true`) launches the JS bundle headless every ~15 min — the root layout never mounts, so each headless wake overwrote the previous foreground launch's `stable` record with one stuck at `sentry_initialized`; the next real launch then reported a phantom incomplete startup (~130 events/user ≈ one per background fetch). Fixed: `beginStartupDiagnostics()` now returns early when `AppState.currentState === "background"` (headless), leaving the foreground record intact. This also stops duplicate `ExpoUpdatesDiagnosticError`/emergency-launch reporting from headless wakes. The residual real signal is OS process death (see BUG-006/011). Resolve REACT-NATIVE-DG once a build with this fix ships and re-baseline.)*

---

## Part D — Suggested Working Order

| # | Item | Scope | Size |
|---|------|-------|------|
| 1 | ~~B-1.1 + B-1.2 + B-1.3 gift sheet freeze~~ ✅ done | `gift-mirage-sheet.tsx` + sibling sheets | S–M |
| 2 | ~~B-2.2 + B-2.3 + B-2.4 wrong/late comment rendering~~ ✅ done | post-detail comment utils + highlight scroll | M |
| 3 | ~~B-2.1 + B-2.5 + C-4 cache/request dedup~~ ✅ done | inbox-cache + post-detail-content | M |
| 4 | ~~B-3 comment compose scroll~~ ✅ done | composer + highlight scroll | M |
| 5 | ~~B-2.6 node thread endpoint + mobile adoption~~ ✅ done | mirage-node + api/read | M–L |
| 6 | ~~C-5 startup/state restore (BUG-003/006/011)~~ ✅ done | services/bootstrap, startup-diagnostics | L |
| 7 | ~~BUG-005 + BUG-012 vote race / render freeze~~ ✅ done (BUG-005 needs device re-test) | use-vote-handler + pow-queue | M |
| 8 | **C-6 `/api/bootstrap` + `view=` cold-start adoption** ← next | api/read, root-layout, launch orchestrator | M–L |
| 9 | C-1 scroll/highlight state machine (now unblocked by B-2.6) | post-detail hooks | M |
| 10 | Remaining QA sheet items by priority | various | — |

---

## Part E — Navigation Restructure (Aug 2026)

The route tree was rebuilt to the canonical **Slot (root) → Stack → Tabs** shape:

- `app/_layout.tsx` → `src/navigation/root-layout.tsx`: providers + app-wide
  overlays (AuthSheet, ForceUpdatePopup, status bar) around a `<Slot />`. No
  screens at root.
- `app/(app)/_layout.tsx` → `src/navigation/app-stack-layout.tsx`: the single
  app Stack. Every screen that needs its own page lives here — `(tabs)` first
  (with `initialRouteName: "(tabs)"` so deep links get a home anchor beneath
  them), the `(auth)` modal group, and all standalone pages (post, topic, user,
  settings, search, etc.).
- `app/(app)/(tabs)/_layout.tsx`: the tab navigator (unchanged).

Share-intent handling follows the same split: **detection stays at the root**
(`ShareIntentProvider` + Android cold-start refresh in `root-layout.tsx`), but
**navigation dispatches from the (app) Stack layout** via
`src/navigation/launch-route-orchestrator.tsx` — extracted from `TabLayout` —
so the Stack owning the target screens is guaranteed mounted before any
share/notification/stale-route redirect fires, and the orchestration no longer
depends on the tab navigator being the active screen.

Consistency pass on the Stack itself:

- **All 23 screens are now explicitly registered** in `app-stack-layout.tsx`
  with family-based presentations (browse → `slide_from_right`, post detail →
  fade, compose → `slide_from_bottom`, modals declared once). Previously 12
  screens (`p/[id]`, `user/[id]`, `edit-post`, `annotate`, `quests`,
  `referrals`, `subscription`, `topics`, `history`, `invite-and-earn`,
  `change-username`, `view-recovery-phrase`) fell back to platform defaults —
  notably `/p/[id]` (share/deep-link post detail) animated differently from
  `/post/[id]` (in-app) despite being the same page.
- **`/post/[id]` is the single canonical post screen.** `/p/[id]` survives
  only because public share URLs are `https://<host>/p/<id>`: the route file
  is now a `<Redirect>` (replace, params preserved) onto `/post/[id]`, and
  `route-map.ts` emits `/post/<id>` directly for all internally-resolved
  deep links, so only raw external paths ever touch the alias and history
  never contains a duplicate post route.
- **(auth) modal-in-modal removed**: the inner (auth) Stack declared
  `presentation: "modal"` per screen while the group itself is already a modal
  in the app Stack; inner screens now push as cards (`slide_from_right`)
  inside the single auth modal, with `initialRouteName: "username"`.
- **`initialRouteName: "(tabs)"`** on the (app) Stack means every cold-start
  deep link gets a home anchor beneath it — the ~43 unguarded `router.back()`
  calls across pages always have somewhere to pop to (previously a cold-start
  deep link made the target the only history entry and back() silently
  no-op'd — the likely mechanism behind "✕ does not dismiss" reports).
- Known candidate, deferred: `media-preview-modal` is a full-screen RN `Modal`
  rather than a stack screen; migrating it touches the zoom/pan gesture stack
  and should be its own change.

All internal hrefs were normalized to **group-free canonical paths** (`/`,
`/create`, `/inbox`, `/profile`, `/following`, `/login`, `/username`,
`/recovery-phrase`) — the generated typed routes only admit fully-qualified or
group-free forms, and group-free paths stay stable across future tree
reorganizations. `isTabRoute` moved into `src/navigation/route-map.ts`;
`isAuthRoute`/`isAppRoute` accept the legacy group forms for compatibility.
Public URLs (`/p/<id>`, `/post/<id>`, …) are unaffected — route groups never
appeared in URLs.

---

## Appendix — Production Sentry Signals (org: mirage-q4, last 14d)

- `IncompleteStartupError` — 20,752 events / 163 users (REACT-NATIVE-DG) → C-5
- `ExpoUpdatesDiagnosticError` — 6,139 events / 182 users (REACT-NATIVE-DE) → C-5
- `AxiosError 503` — 177 events / 30 users (REACT-NATIVE-7) → C-4 backend load
- `Post detail highlight comment not found` — warning, prod-confirmed → B-2
- `videoPlayer.addListener` crashes — 3 issues, ~136 events → BUG-009 family
- `EXC_BAD_ACCESS Field.key.getter` — 2 issues, 30 events, 22 users (native crash)
- `Missing queryFn` for posts feed keys (REACT-NATIVE-15/DA) — persisted-query
  restoration referencing keys without registered fetchers → cache hygiene
