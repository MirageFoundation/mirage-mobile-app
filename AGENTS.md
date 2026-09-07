# AGENTS.md

This file defines the working rules for coding agents in this repository.

## Project Snapshot
- App: Expo / React Native mobile app
- Package manager: `bun`
- Router: Expo Router
- Server state: TanStack Query
- Client state: Zustand
- Dependency policy: structural changes must be dependency-neutral unless explicitly requested. Do not upgrade Expo/RN/video/native dependencies as part of cleanup work.

## Non-Negotiable Working Rules

### 1) Use Bun
Always use `bun` for repo commands.

Examples:
- `bun run lint`
- `bunx eslint ...`

Do not introduce npm/yarn/pnpm commands in docs or scripts unless explicitly required.

### 2) Respect the routing boundary
- `app/` is for route wrappers, layouts, and route-level config only.
- Route files should stay tiny and delegate to `src/pages/*`.
- Do not move feature business logic back into `app/`.

### 3) Respect the navigation boundary
Navigation logic belongs in:
- `src/navigation/route-map.ts`
- `src/navigation/linking.ts`
- `src/navigation/guarded-router.ts`
- `src/navigation/auth-navigation.ts`

Note: the legacy compatibility wrappers (`src/utils/guarded-router.ts`, `src/hooks/use-router.ts`) have been removed. All callers use `src/navigation/guarded-router.ts` directly (enforced by `check:navigation`).

When touching deep links, route parsing, guarded navigation, or auth-aware navigation:
- prefer changing `src/navigation/*`
- do not reintroduce duplicate parsing logic elsewhere
- do not add new direct deep-link parsing in page files or route wrappers

### 4) Respect the store boundary
`src/stores/*` must not import from:
- `src/pages/*`
- `src/components/*`

Shared data model types should live in `src/domain/*`.

Zustand is for client state only, especially:
- auth/session metadata
- preferences
- drafts
- UI state
- local-only persisted state

Do not put new query orchestration, endpoint fetch logic, or feature/page coupling into stores.

### 5) Respect query/cache ownership
Use centralized query helpers:
- `src/api/read/query-keys.ts`
- `src/api/write/mutation-keys.ts`
- `src/api/cache/*`

Rules:
- do not introduce raw literal query keys like `['posts']`
- do not introduce write hooks without `mutationKey`
- prefer reusable cache helpers over page-local ad hoc cache mutation
- prefer targeted invalidation/removal over `queryClient.clear()` in normal flows

### 6) Prefer modular page structure
Feature pages should be split into focused modules under `src/pages/<feature>/*`.

Targets:
- soft warning: files over **400** lines
- strong refactor target: files over **600** lines

When touching a large screen, prefer extracting:
- feature components
- feature hooks
- utilities
- overlay renderers
- section renderers

### 7) Avoid effect-heavy orchestration
When editing code, prefer:
- derived state
- event handlers
- memoized selectors
- query options (`enabled`, `select`, etc.)
- centralized listeners/providers when truly app-global

Avoid adding new `useEffect` chains that only synchronize derivable state.

## Established Architecture

### Directory intent
- `app/` → Expo Router wrappers/layouts only
- `src/pages/` → page containers and feature screens
- `src/navigation/` → route parsing, guarded router, deep links, auth navigation
- `src/api/read/` → read endpoints/hooks/query keys
- `src/api/write/` → write endpoints/hooks/mutation keys
- `src/api/cache/` → reusable cache update helpers
- `src/domain/` → shared domain-safe model types
- `src/stores/` → Zustand stores only
- `src/components/` → UI building blocks and reusable feature UI

### Current canonical paths to prefer
- guarded router hook/proxy: `@/src/navigation/guarded-router`
- deep-link helpers: `@/src/navigation/linking`
- query keys: `@/src/api/read/query-keys`
- mutation keys: `@/src/api/write/mutation-keys`
- home post-card store: `@/src/stores/home-post-card-store`
- domain types:
  - `@/src/domain/posts/types`
  - `@/src/domain/comments/types`
  - `@/src/domain/content/types`

## Code Change Guidance

### When making edits
Prefer small, behavior-preserving refactors.

Good patterns:
- extract a hook
- extract a render component
- extract a cache helper
- replace duplicate logic with centralized helpers
- replace wrapper imports with canonical imports

Avoid:
- broad rewrites without need
- moving logic across boundaries without improving ownership
- introducing new giant files
- reintroducing duplicate router/cache/store logic

### When touching large screens
Before adding more code to a large screen, first ask:
- can this become a feature hook?
- can this become a dedicated section component?
- can this become a helper/util file?
- can this move to `src/api/cache/*` or `src/navigation/*` instead?

## Verification Expectations
Run focused verification for the area you touched.

### Useful commands
- `bun run lint`
- `bun run check:file-sizes`
- `bun run check:navigation`
- `bun run check:stores`
- `bun run check:query-keys`
- `bun run check:architecture`

### What checks mean
- `check:file-sizes` → reports large page files
- `check:navigation` → smoke-checks route/deep-link parsing
- `check:stores` → ensures stores do not import pages/components
- `check:query-keys` → guards against raw query-key literal regressions

If you touch a narrow feature, prefer targeted eslint runs for those files instead of always linting the whole repo.

## Quick Do / Don’t

### Do
- use `bun`
- use `src/navigation/*` for navigation logic
- use `src/api/read/query-keys.ts`
- use `src/api/write/mutation-keys.ts`
- use `src/api/cache/*` for reusable cache logic
- use `src/domain/*` for shared model types
- keep `app/` thin
- keep stores page/component-free

### Don’t
- add raw query keys
- add new mutation hooks without `mutationKey`
- put server-fetch logic in stores
- put feature logic back into `app/`
- introduce duplicate deep-link parsing
- introduce new huge page files
- use `queryClient.clear()` as ordinary app flow control

## Analytics (Mixpanel)

This project uses Mixpanel for product analytics via `mixpanel-react-native`.

### Rules
- ALL analytics calls go through `src/services/analytics.ts`. Never import `mixpanel-react-native` directly anywhere else.
- Tracking is **consent-gated** (EU users). The SDK only initializes after the user opts in (`analyticsConsent` in `src/stores/preferences-store.ts`). Never add tracking that bypasses this gate.
- Token: `EXPO_PUBLIC_MIXPANEL_TOKEN` env var, with the production token as fallback in `src/services/analytics.ts`.
- Identity: `distinct_id` = wallet address. `identifyUser()` fires on wallet creation confirm, wallet import, and logged-in startup (`src/stores/auth-store.ts`). `resetAnalyticsIdentity()` fires on logout.

### Event conventions
- Event names: `object_verb` past tense, `snake_case` (e.g. `post_created`, `vote_cast`).
- Property names: `snake_case`, lowercase string values. No `$` or `mp_` prefixes.
- Never construct event names dynamically.
- Omit properties that don't apply — never send `null`, `""`, or `"N/A"` (the wrapper strips these).
- Add new event names to the `AnalyticsEventName` union in `src/services/analytics.ts`.
- Place `trackEvent()` calls in mutation `onSuccess` handlers or action success callbacks — not on button press (avoids counting failed actions).

### Current events
| Event | Fires in |
|---|---|
| `onboarding_started` | `username-content.tsx` mount (signup funnel entry) |
| `username_set` | `username-content.tsx` after on-chain username success |
| `recovery_phrase_viewed` | `recovery-phrase-page.tsx` mount (onboarding only) |
| `sign_up_completed` | `auth-store.ts` → `confirmWalletCreation` |
| `login_completed` | `auth-store.ts` → `importWallet` |
| `post_create_opened` | `create-content.tsx` mount (create mode only) |
| `post_created` (Value Moment) | `use-post.ts` → `usePost` onSuccess |
| `comment_posted` | `use-post.ts` → `useComment` onSuccess |
| `vote_cast` | `use-vote-handler.ts` → POW queue onSuccess |
| `user_followed` | `use-follow.ts` → follow/toggle onSuccess (follows only) |
| `community_joined` | `use-community-membership.ts` → join/toggle onSuccess (joins only) |

Onboarding funnel: `onboarding_started` → `username_set` → `recovery_phrase_viewed` → `sign_up_completed`.
`username_set` has no invite or referral properties.
Creation funnel: `post_create_opened` → `post_created`.

Super properties: `platform`, `app_version`, `tier`. User profile: `username`, `tier`. No PII, no wallet balances.

## Error Reporting (Sentry)

Sentry event filtering and sampling are configured centrally in `src/navigation/root-layout.tsx`.

### Severity rules
- Use `Sentry.captureException(error)` for unexpected failures that indicate a defect or prevent a user operation from completing.
- Use error-level events for crashes, broken invariants, corrupted state, unrecoverable failures, and failures that require engineering action.
- Use warning-level events only for abnormal, actionable states that may recover. Warning messages are sampled, so they are not guaranteed to reach Sentry.
- Use `Sentry.addBreadcrumb()` for expected failures, retries, navigation diagnostics, lifecycle transitions, and other debugging context. Breadcrumbs do not create events by themselves.
- Do not use info-level `captureMessage()` calls for routine telemetry. Info events are dropped centrally; use breadcrumbs or Mixpanel as appropriate.
- If a warning becomes important enough that every occurrence must be retained, promote it to an error-level event or explicitly allowlist it in the central Sentry filter.

### Current sampling policy
- Error and fatal events, including ordinary `captureException()` calls, are retained.
- Info events are dropped.
- Warning messages are sampled at 10%.
- Performance traces are sampled at 2%.
- Error session replays are sampled at 10%; replay sampling does not prevent the underlying error event from being sent.
