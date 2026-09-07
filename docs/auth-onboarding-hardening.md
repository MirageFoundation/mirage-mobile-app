# Auth/onboarding hardening

## Phase 1: local identity and secure persistence

Remediates the wallet-persistence/startup findings supplied from audit
`49fdc51d`. JS-only; no dependency, native, backend, or account changes.

- Replacement retains existing candidate/backup key names and metadata commit
  semantics. It verifies primary and metadata commit/rollback before deleting
  recovery artifacts. Promotion plus rollback failure raises
  `WalletRecoveryError` (`wallet_recovery_required`) and retains both artifacts.
  First creation now uses the same verified persistence transaction, without
  changing pending signup flags; a silently failed SecureStore write cannot
  produce a supposedly backed-up wallet from memory alone.
- Recovery uses a primary matching public metadata, or restores a backup whose
  address matches that metadata and verifies the write. Ambiguous states,
  including a candidate-only interrupted first write, remain fail-closed and
  retain keys. It does not guess which account the user intended. Recovery can
  be rerun; cleanup failures cannot erase the only verified copy.
- Conflicting legacy/current secure identities are retained rather than deleting
  the legacy signer during accessibility migration.
- `WalletService.prepareCleanup()` clears signing caches and persists/readbacks
  `wallet_cleanup_pending_v1` in MMKV before destructive operations. Intentional
  logout/delete removes *all* secure wallet copies, unlike replacement recovery.
  Secure removals and public wallet metadata removals are verified before the
  marker is removed. Failure raises `WalletCleanupError`
  (`wallet_cleanup_incomplete`); auth state and live recovery phrase are removed
  regardless. WalletProvider exposes the error and a non-destructive retry.
- On startup, a pending cleanup marker triggers cleanup, never login. Failure
  keeps signing blocked. A successful retry removes the marker and restores a
  guest, not the deleted identity. Visitor/campaign/device preferences are not
  wiped by wallet cleanup; existing logout resets are retained.
- If MMKV cannot persist the marker at all, no destructive wallet operation is
  attempted, signing remains blocked in this process, and logout rejects
  honestly. No JS protocol can promise restart durability when *all* durable
  writes fail. Do not reinstall/clear app data as a recovery procedure.
- Startup derives and compares both address and public key with metadata before
  exposing a session. Missing metadata with a secure key, missing secure key
  with metadata, and mismatches require explicit recovery. No unverified
  metadata is reconstructed and no alternative signer is silently selected.
- Local secure lifecycle operations are serialized, including migration and
  cleanup, so a late migration cannot write keys back after deletion.
  `useWallet.getWallet()` checks live auth generation/address after awaiting;
  service retrieval also checks its own invalidation generation and auth token.
  Service signing reuses the validated key and rechecks the auth session.
  Already handed-out JS key objects cannot be cryptographically revoked; retain
  existing current-generation write/settlement guards.
- Logout push-token cleanup remains in the auth identity queue (avoids clearing
  a newer login's token), parallel with local key deletion. Network work cannot
  delay deletion, though the logout promise can still await unregister.

## Local-first performance contract

`initializeWalletOnce`, `WalletLocalSession`, and the service startup promise
coalesce concurrent initialization. The normal current-key fixture performs four
secure reads (candidate, backup, primary, legacy), one mnemonic derivation, and
no additional secure reads/derivations for ten concurrent wallet consumers or
subsequent signing. Recovery/migration paths necessarily perform more work.
No private key is persisted in MMKV.

The auth-store integration fixture leaves backend bootstrap unresolved and
still completes safe local restoration, sets `isInitializing: false`, and
exposes the validated identity. Bootstrap/status refresh remains background and
current-generation scoped; `isBootstrapping` continues to gate dependent reads.
Cached tier/quota data is not stamped freshly authoritative and write
requirements are unchanged. These are mocked operation counts and scheduling
properties, **not device timing measurements**. Physical iOS/Android Keychain,
Keystore, app-kill, and locked-device behavior still require device testing.

## Phase 2: signup, phrase import, and secret screens

Implemented JS-only without dependency, native, backend, account, or deployment
changes. Phase-1 transactional key writes, cleanup markers, identity validation,
and normal local-first startup are retained.

### Signup policy and migration

- Public `WalletMetadata.signup` adds `phase`, `operationId`, optional `username`,
  `server`, and `txHash`. No secret is added to MMKV. Existing SecureStore keys
  and metadata transaction/readback mechanisms are unchanged.
- New wallet generation records `wallet_generated` but does not log in or
  redirect the username screen. `use-signup-registration.ts` owns the progress
  controller, uses a synchronous tap lock, and prevents route removal while an
  operation is running. Only explicit navigation after terminal success moves
  to the signup phrase screen; generating or merely possessing a phrase cannot
  authorize that screen or confirm a session.
- `signup-registration.ts` records/readbacks `registering` before signing and
  broadcast. The production username endpoint fences immediately before sending
  and records `submitted` plus the returned hash before its promise resolves.
  Session generation, wallet address, operation ID, and server generation fence
  stale work. Known failures before broadcast reset to `wallet_generated` for
  explicit edit/retry with the same key. An allowlist of documented prebroadcast
  username/registration 400/403 error codes also permits retry; transport errors,
  503, and message-text lookalikes do not. Hashes in error responses are saved
  immediately too. Transport uncertainty stays pending.
- Reconciliation is an explicit **Check registration / resume** action after
  interruption or an indexing delay, not a network dependency on normal startup.
  It uses a fresh wallet-signed `/bootstrap` request for authoritative username
  status, and `/get_tx_status` when needed. A matching served username records
  `confirmed`; an indexed explicit transaction failure permits retry. Missing
  status, missing transaction identity, 503, timeout, and success without a
  matching username never authorize confirmation or disposal. Each reconciliation
  has a 20-second abort deadline. Uncertain transactions are not regenerated or
  automatically rebroadcast. Signup bypasses the generic automatic PoW retry
  wrapper entirely; existing non-signup endpoint callers keep their old retries.
- All pending keys survive restart regardless of local `hasUsername`. Legacy
  pending metadata without a checkpoint is treated as uncertain (even if its
  old `hasUsername` flag is true) until signed status reconciliation. Migration
  does not infer a failed operation from absent local flags or delete keys.
- A retained-key backup panel is available even without a transaction hash. It
  explains that backup is not registration or login. Explicit **Abandon signup**
  requires a destructive confirmation warning about pending transactions and
  funds; its callback is session-fenced and uses phase-1 logout cleanup. Closing
  an error or leaving signup does not discard the key. Pending signup also
  blocks wallet replacement through import until it is completed or deliberately
  abandoned.
- Store confirmation verifies the current secure wallet, matching pending
  metadata and a confirmed username checkpoint, and rechecks disclosure activity
  after its await. An address, route parameter, or mutable UI flag alone is not
  sufficient. Initial local restoration and wallet operations have synchronous
  store-level gates; failed import replacement reselects a verified previous
  signing identity rather than leaving its session detached.

### Submission and phrase protections

- Registration submission requires explicitly enabled successful config and
  successful non-fetching availability for the current name. Handler preflight
  refetches both config and availability, checking captured name/server again;
  stale, failed, loading, disabled, and empty checks cannot authorize submission.
  Configuration and availability failures have visible retry controls. Pending
  reconciliation remains usable when registration is disabled because it does
  not submit a new transaction.
- Phrase input supports all BIP39 English lengths: **12/15/18/21/24**. Full paste
  detects the length, manual selection is explicit, and shrinking populated
  fields or overflowing a partial paste is rejected without changing fields.
  Whitespace/case normalize without removing arbitrary characters. Unsupported
  lengths and invalid characters are rejected, never truncated. Import validates
  the installed English wordlist and checksum with distinct errors, locks
  double-submit, and fences hidden/unmounted screens. Successful import clears
  the local input; failed replacement preserves the draft for explicit retry.
  Rejected paste also blocks submission of any previously valid phrase until
  the input is corrected, so retained old fields cannot silently import another
  wallet after a failed paste.
- Settings, signup recovery, retained-key backup, and login share the existing
  screen-capture/app-switcher APIs through reference-counted protection claims.
  Signup/login need no prior biometric enrollment; Settings retains its existing
  biometric requirement. Secrets start concealed and are removed from rendered
  content on blur/inactive/background. Return requires an explicit reveal/resume;
  the input draft stays only in memory. Confirmation cannot run while concealed.
- Signup copy is explicit and uses SHA-256-checked clipboard expiration, shared
  with Settings. Expiry never clears a clipboard whose contents have changed.
  Clipboard reads denied by the OS are not overwritten. No automatic copy or
  secret analytics/logging was added. JS expiry timers cannot promise clearing
  after process termination, and clipboard comparison/write is not an OS-level
  atomic compare-and-swap.

## Phase 3: central protected entry and pending auth intent

Implemented in the same run as integrated verification. No dependency, native,
backend, credential, live-account, or deployment change.

### Entry policy and actual wrapper inventory

The installed Expo Router **56.2.16** supports `screenLayout` through its own
bundled navigation implementation, not application `@react-navigation/*` imports.
`AppStackLayout` and `TabsContent` install `ProtectedEntry` around each screen's
SceneView, before its page mounts. This deliberately uses a screen-layout gate
instead of removing protected destinations with `Stack.Protected`: denied direct
entries retain their exact destination long enough to capture the login intent.
The navigator stays mounted, and the page does not mount during local hydration
or while unauthorized. Classification uses each screen's own route name, not
the global foreground pathname, so a protected screen cannot mount behind the
public login modal during an outgoing transition. Public group wrappers remain
mounted; individual sensitive tabs have the same gate as stack screens.

SDK-56 runtime correction (2026-09-07): the initial gate incorrectly imported
`useIsFocused` from `@react-navigation/native`. Live Metro failed the entire iOS
bundle with "As of SDK 56, expo-router is no longer compatible with
react-navigation", pointing directly to `protected-entry.tsx`. Typecheck and
injected-hook tests had masked the incompatible package boundary. The hook now
comes from the public `expo-router` export, which shares the screen layout's
bundled navigation contexts. No compatibility-disable environment flag is used.
The existing running Metro then returned HTTP 200 for the full iOS bundle
(23,796,129 characters); subsequent live client logs showed multiple post opens
and video first-frame events. No simulator was booted, so this is bundler and
observed client-log evidence, not automated simulator visual QA. No device reload,
storage cleanup or account action was issued by the agent.
`tests/expo-router-sdk-boundary.test.ts` guards against the forbidden imports and
renders the installed Expo Router focus hook with its actual NavigationProvider
and focus contexts, including inactive screens behind a modal and inactive nested
tabs. The corrected full architecture suite passed **954 tests across 159 files**,
plus full lint/typecheck and all guardrails. The separate live invite transaction
rejection remains outside this navigation correction.

| Policy | Actual canonical routes |
| --- | --- |
| Public | `/`, `/post/[id]`, `/p/[id]` alias, `/post-media/[id]`, `/communities`, `/c/[slug]`, `/c/[slug]/teams`, `/c/[slug]/teams/[teamId]`, not-found |
| Public auth entry, existing disclosure checks retained | `/login`, `/username`, `/recovery-phrase` |
| Authenticated and username-ready | `/following`, `/inbox`, `/profile`, `/create`, `/settings`, `/search`, `/user/[id]`, `/user-following/[id]`, `/blocked-list`, `/curation-invitations`, `/creator-earnings`, `/subscription`, `/history`, `/saved-posts`, `/delete-account`, `/view-recovery-phrase`, `/video-editor`, `/edit-post`, `/comment-compose` |
| Authenticated, username setup allowed | `/change-username` |

Search, user profiles, and user-following keep their previously declared
authenticated policy; this work does not silently broaden or narrow that
product policy. Public feed/post/media/community/team browsing remains public.
An authenticated wallet missing username readiness can reach change-username
without a redirect loop. A generated wallet or pending signup is not an
authenticated session, including when its local username checkpoint is true.
Signup recovery still requires the verified local pending disclosure checkpoint;
query parameters cannot grant disclosure. Settings recovery retains biometrics.

`routeRequiresAuth` is shared by linking, explicit auth navigation, and screen
entry. `validatePendingRoute` canonicalizes group paths and validates a fixed
mapping before storing/replaying navigation targets. Internal history, saved,
delete, username-change, recovery-view, video-editor, edit and compose wrappers
remain valid internal targets without becoming external URL aliases. Internal
subscription remains valid; its existing iOS external-link exclusion is retained.
Retired and unknown external routes remain not-found. Non-HTTP web protocols,
credential-bearing URLs, malformed resource segments and arbitrary external
pending destinations cannot become return destinations. `returnTo` is never
interpreted as navigation. The self-following alias resolves its fixed wallet
placeholder after login without rewriting unrelated query values.
Path-fallback diagnostics no longer retain raw URL/query values or parser error
strings that could contain an untrusted recovery-phrase parameter.

### One pending-intent lifecycle

- Cold links still enter through Home; warm protected system links now return
  Home rather than briefly presenting not-found. Direct internal pushes are
  blocked at screen entry and replace the denied screen with login (or username
  setup). The installed router's global-href hook preserves the original query,
  including repeated query keys, without mixing in dynamic route params.
  During cold restored entry, the screen gate records and conceals the target
  but lets the launch orchestrator establish Home before presenting auth; the
  two redirect owners cannot cancel each other's pending intent.
- `useDeepLinkStore` has a monotonically increasing intent revision. New intent
  replaces old deterministically; consumption/cancel/logout invalidates stale
  callbacks. Cancel and Android alert dismissal clear only the captured intent;
  delayed alerts and old Log In actions cannot act on a newer one.
- Production `usePhraseImport.handleLogin` and recovery
  `handleContinue` already call `exitAuthModal` after successful, fenced store
  actions. That function now marks the completed exit with the intent revision
  and auth-session token before replacing the modal with Home.
  `AuthIntentOrchestrator`, mounted beside the app Stack, replays after the auth
  route has exited, navigation is mounted, the existing adult prompt is ready,
  stack transitions end and interactions settle. Tabs use navigate; other
  targets use push after the Home replacement. One shared replay handles cold
  and warm auth completion; the cold-only replay ref has been removed.
- Back, swipe dismissal and explicit modal close clear the captured intent unless
  this was the successful auth exit. Failed import preserves the intent while
  the modal remains open for retry. Ordinary login with no intent exits Home.
  Logout clears immediately, even if secure cleanup later rejects; account
  deletion uses that same logout. Authenticated wallet replacement, observed
  identity/server changes, cancelled interactions and stale session callbacks
  cannot replay the old destination into another context. Logout-confirmation
  alerts are also fenced against a replacement session.
- Readiness reads only in-memory locally verified auth metadata. There is no
  SecureStore read, key derivation, endpoint request or fresh-bootstrap wait in
  a route guard. Confirmed cached username metadata permits established offline
  startup while bootstrap remains background work. This is client UX gating,
  not a replacement for backend wallet signatures or write authorization.

## Verification fixtures

Synthetic strings and injected in-memory storage only; no real recovery phrase,
account, backend request, or native module is used. The harness evaluates the
production service/store/hook bodies with native imports replaced by fixtures.

- `scripts/wallet-recovery-failures.test.js`: every successful replacement I/O
  stage fails before/after mutation; double failure; ambiguous metadata;
  recovery retry and candidate-only preservation.
- `scripts/wallet-local-session.test.js`: identity mismatch/missing states,
  signing cache eviction, tombstone/restart/retry, silent deletion/readback
  failures, serialized migration cleanup, concurrent startup, stale retrieval,
  and validated signing reuse.
- `scripts/auth-local-startup.test.js`: persisted login fails closed, local-only
  startup, shared initialization, stale backend fencing, and typed logout/import
  failures without exposed UI secrets.
- `scripts/wallet-first-create.test.js`: first-create readback verification,
  unchanged pending metadata, silent write failures, and failed initial rollback.
- Existing wallet transaction, auth session/policy, and account-deletion tests
  remain part of focused and full checks.

Phase-1 verification (2026-09-07): focused wallet/auth tests and targeted ESLint
passed; `bun run typecheck` passed; `bun run test` passed **919 tests** across
153 files; `bun run check:architecture` passed (including full lint/typecheck,
store/layer/query/navigation/accessibility/file-size checks and tests).
`git diff --check` passed. Native/device checks were not run.

Phase-2 verification (2026-09-07):

- Production endpoint/service/hook/store fixtures in
  `scripts/signup-checkpoints.test.js`, `scripts/phrase-import-hardening.test.js`,
  `scripts/secret-screen-hardening.test.js`, and the expanded
  `scripts/auth-local-startup.test.js` pass. They cover operation/hash ordering,
  readback failures, local/server/session races, legacy restart retention,
  explicit rejection vs transport uncertainty, same-frame locks, safe retries,
  stale confirmation, all English BIP39 lengths, a valid 24-word phrase whose
  12-word prefix is also valid, rejected-paste blocking, clipboard replacement,
  shared capture claims, background concealment, and late native setup cleanup.
- Focused command passed:
  `bun test scripts/wallet*.test.js scripts/auth*.test.js scripts/signup-checkpoints.test.js scripts/phrase-import-hardening.test.js scripts/secret-screen-hardening.test.js tests/auth-*.test.ts tests/recovery-phrase-disclosure-policy.test.ts tests/registration-gate.test.ts`.
- `bun run check:architecture` passed: full **948 tests across 157 files**, full
  lint and typecheck, plus file-size/store/layer/query/accessibility/navigation
  checks. Hook dependency warnings: zero. `git diff --check` passed.
- Normal local-first four-read/coalesced-derivation startup fixtures still pass;
  no mandatory reconciliation/network step was added for established accounts.
- Fixtures use only synthetic nonsecret strings and public deterministic BIP39
  test entropy; no real user recovery phrase or account operation was performed.

Phase-3/integrated verification (2026-09-07):

- `bun test ./tests/fixtures/navigation-linking-runtime.ts`: **55 passed**, with
  3,812 assertions. Native/store-boundary fixtures execute the actual entry
  component, cold launcher, auth-intent orchestrator, login callback, linking,
  route map and revision store. Includes the cold restored-entry redirect race,
  background private-screen concealment, exact/repeated queries, public routes,
  cancel/retry/new intent, transition/session/server fences and unsafe targets.
  The full suite includes this isolated runtime through its wrapper test; do not
  add its 55 cases again to the full-suite total below.
- `scripts/auth-local-startup.test.js` now composes actual secure-service and
  auth-store import with the actual phrase callback, modal exit and layout replay.
  A second test executes the actual recovery-screen confirmation callback with
  the production secure/store confirmation before modal exit and replay. Only
  storage/crypto/native/backend boundaries use synthetic fixtures. The normal
  restored-user fixture executes ten route-readiness checks while backend
  bootstrap stays unresolved: still **four secure reads, one derivation**, and
  no guard-triggered request or additional secure operation.
- Focused command passed **134 tests across 14 files**:
  `bun test scripts/wallet*.test.js scripts/auth*.test.js scripts/signup-checkpoints.test.js scripts/phrase-import-hardening.test.js scripts/secret-screen-hardening.test.js tests/auth-*.test.ts tests/recovery-phrase-disclosure-policy.test.ts tests/registration-gate.test.ts tests/navigation-linking-runtime.test.ts`.
- Final `bun run test`, `bun run lint`, `bun run typecheck`, and
  `bun run check:architecture` all passed. Full test total: **952 passed across
  158 files**, zero failures. File-size/store/layer/query/accessibility/navigation
  guardrails passed; exhaustive-dependency warnings: zero. `git diff --check`
  passed. Existing staged and unrelated changes were preserved; no commit.
- No native device, real signup/import, backend write, install, build, deployment
  or real-wallet operation was performed. Device timing/backstack/OS protection
  remain the QA work below, not another unimplemented JS auth phase.

### Reload and native QA still required

No simulator/physical-device, live backend/account, app-install, native build, or
native OS protection test was run. Test iOS and Android screenshot/recording
prevention, app-switcher previews, rapid inactive/background/foreground changes,
biometric Settings disclosure after sharing capture claims, denied clipboard
reads, replacement clipboard content, and OS suspension/kill before clipboard
expiry. Test manual and pasted 12/15/18/21/24-word drafts with keyboard, scrolling,
VoiceOver/TalkBack, and large text on small screens. Kill/reload at each signup
checkpoint (including a lost response before a hash is known) and verify key
retention, explicit check/resume, registration-disabled reconciliation, and
confirmed-user offline startup. Retained unknown-hash operations may require
later indexing or deliberate backup/abandon; no automatic resend is offered.
Keep device data intact during recovery.

Additional device navigation QA: cold/warm path, HTTPS and app-scheme entry to
every sensitive family; direct tab/stack pushes during slow local hydration;
login Cancel, swipe dismissal, failure/retry, signup confirmation, logout and
server replacement while modal animations run. Confirm no private screen appears
behind login, replay happens once after dismissal, the exact query survives, and
Back returns to Home rather than reopening auth or the denied route. Exercise
offline restored confirmed users with cached feeds and a blocked bootstrap.
These native-stack animation/backstack and OS behaviors remain device QA, not
claims established by the mocked dispatch-order tests.
