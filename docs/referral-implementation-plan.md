# Referral System — Mobile Implementation Plan

> Based on `mobile_referral_integration.md` spec.
> This plan covers all changes needed in the React Native app codebase.

---

## Phase 1: API Layer (Types, Endpoints, Hooks)

### 1.1 Add new types to `src/api/types.ts`

- Add `referral_precheck_enabled: boolean` to `UserStatusResponse`
- Add new interfaces:
  ```ts
  // Referral precheck
  interface ReferralPrecheckResponse {
    valid: boolean;
    available?: number;
    error?: string;
  }

  // Referral precheck opt-in
  interface ReferralPrecheckOptInResponse {
    ok: boolean;
    precheck_enabled: boolean;
    updated_at: number;
  }

  // Referral summary
  interface ReferralSummaryItem {
    address: string;
    username: string;
    referred_at: number;
    posts: number;
    votes: number;
    total_actions: number;
  }

  interface ReferralSummaryResponse {
    referrals: ReferralSummaryItem[];
    total: number;
    period_start: number;
    period_end: number;
    limit: number;
    offset: number;
    has_more: boolean;
  }
  ```
- Keep old `ReferralStatsResponse` / `ReferralNode` for now (backward compat), mark deprecated

### 1.2 New read endpoint: `src/api/read/endpoints/referrals.ts`

| Function | Route | Auth | Notes |
|----------|-------|------|-------|
| `getReferralPrecheck({ username })` | `GET /referrals/precheck` | No | Returns `ReferralPrecheckResponse` |
| `getReferralSummary({ address, period?, month?, limit?, offset? })` | `GET /referrals/summary` | No | Returns `ReferralSummaryResponse` |

- Export from `src/api/read/endpoints/index.ts`

### 1.3 New write endpoint: `src/api/write/endpoints/referral-precheck-opt-in.ts`

- `POST /referrals/precheck_opt_in` — signed request
- Signature payload: `referrals_precheck_opt_in:<address_lowercase>:<1|0>:<timestamp>:<nonce>`
- This does NOT use the standard `buildSignedEnvelope` (no PoW, no canonical builder). It uses a simpler signing pattern — sign the payload string directly and send `{ pubkey, signature, address, enabled, timestamp, nonce }`.
- Need to check if there's an existing pattern for simple signed POST (non-PoW). If not, build a lightweight helper.

### 1.4 Fix existing endpoint: `src/api/write/endpoints/username.ts`

- Rename field `referrer` → `referrer_username` in `SetUsernameInput`, `SetUsernamePayload`, and the body construction
- The backend expects `referrer_username`, not `referrer`

### 1.5 Add query keys: `src/api/read/query-keys.ts`

```ts
referralPrecheck: (username: string) => ["referral", "precheck", username] as const,
referralSummary: (address: string, period?: string, month?: string) =>
  ["referral", "summary", address, period, month] as const,
```

### 1.6 New hooks: `src/api/read/hooks/use-referrals.ts`

| Hook | Key | Notes |
|------|-----|-------|
| `useReferralPrecheck(username)` | `referralPrecheck` | Enabled only when `username` is truthy; no auth |
| `useReferralSummary({ address, period, month, limit, offset })` | `referralSummary` | Pagination via `offset`; enabled when `address` truthy |

- Export from `src/api/read/hooks/index.ts`

### 1.7 Export everything

- Update `src/api/read/endpoints/index.ts` — add `getReferralPrecheck`, `getReferralSummary`
- Update `src/api/read/hooks/index.ts` — add `useReferralPrecheck`, `useReferralSummary`
- Update `src/api/write/endpoints/index.ts` — add `referralPrecheckOptIn`
- Update `src/api/write/index.ts` — add new endpoint + hook exports

---

## Phase 2: Invite & Earn Screen — Referral Toggle + Share Link

### 2.1 Add "Enable Referral Link" toggle to `src/pages/invite-and-earn-screen.tsx`

- Add a toggle/switch at the top of the screen (or in a dedicated "Referral Link" card section)
- Only visible when `registration_invite_code_required === true` (from node config via `useNodeConfig`)
- Label: **"Referral Link"** with subtitle: "Allow people to sign up using a personal link with your username. Anyone with the link can use your codes, so leave this off if you want to hand them out manually."
- Read initial state from `useUserStatus` → `referral_precheck_enabled`
- On toggle: call `POST /api/referrals/precheck_opt_in` with `enabled: true/false`
- Optimistic update: toggle immediately, revert + error toast on failure
- Invalidate `userStatus` query key on success

### 2.2 Add referral link display + copy button on same screen

- Show a **share box card** directly below the toggle (only when toggle is ON)
- Contents:
  - The referral URL in a styled read-only text field: `https://{node}/signup?ref={USERNAME}`
  - **Copy** button — copies URL to clipboard, shows toast "Link copied"
  - **Share** button — triggers native share sheet with the URL
- When toggle is OFF but user has unused invite codes:
  - Show fallback share box with `https://{node}/signup?invite={FIRST_UNUSED_CODE}` instead
- When toggle is OFF and no unused codes:
  - Don't show the share box at all
- URL construction:
  - Node base URL: from `usePreferencesStore` → `apiServer` (e.g. `https://mirage.talk`)
  - Username: from `useAuthStore` → `user.username`
  - First unused code: from existing `useInviteCodes` hook → find first `is_used === false`

### 2.3 Referrals dashboard section (below share box)

- **Period tabs**: `Last 7 Days` | `Last 30 Days` | `This Month` | `Last Month`
  - Map to: `period="7d"`, `"30d"`, `period="month"&month=YYYY-MM` (current), `period="month"&month=YYYY-MM` (previous)
- **Referred users list**: each row shows:
  - Username (or truncated address if no username)
  - `referred_at` as relative time
  - Posts / Votes / Total actions counts
  - **"Real user" badge**: green checkmark or badge when `total_actions >= 10`
- **Empty state**: "No referrals yet" message
- **Pagination**: "Load More" button when `has_more === true`; on failure keep existing data + inline error
- Data: `useReferralSummary` hook with period state

---

## Phase 3: Username Screen — Referral Signup Flow

### 3.1 Deep link handling (folded into this phase)

- In `src/utils/internal-link-handler.ts`:
  - Add `"signup"` to `MirageLinkType`
  - Handle `/signup` path — extract `?ref=` and `?invite=` query params
  - Navigate to `/(auth)/username` passing `ref` or `invite` as route params
  - If both `ref` and `invite` present: only pass `invite` (direct code takes priority)
- In `app/+native-intent.ts`:
  - If incoming URL matches `/signup`, redirect to `/(auth)/username` with params
- Per spec: `ref` value is stored in component state only — never persisted

### 3.2 Modify `app/(auth)/username.tsx`

The screen now supports three modes:

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Normal** (current) | No params | User types invite code manually |
| **Referral** | `?ref=USERNAME` param | Auto-precheck → "Invite code applied" |
| **Direct invite** | `?invite=CODE` param | Pre-fill invite code input |

#### New state:
```ts
const [referrerUsername, setReferrerUsername] = useState<string | null>(null);
const [precheckStatus, setPrecheckStatus] = useState<'idle' | 'loading' | 'valid' | 'error'>("idle");
const [precheckError, setPrecheckError] = useState<string | null>(null);
const [precheckAvailable, setPrecheckAvailable] = useState<number | null>(null);
const [alreadyUsedCode, setAlreadyUsedCode] = useState(false);
```

#### Referral flow (when `?ref=USERNAME` arrives):
1. On mount: read `ref` from route params, set `referrerUsername`
2. If `inviteCodeRequired` is false → ignore `ref` entirely, normal mode
3. Call `GET /referrals/precheck?username=USERNAME`
4. **While loading**: invite code input shows "Checking referral..." in a **disabled/unclickable** state. Hide Continue button.
5. **On `valid: true`**:
   - Invite code input becomes a disabled field showing **"Invite code applied ✓"** (with checkmark)
   - Below the input: **yellow** note text: **"Only {available} codes left"** (creates urgency)
   - Username input + Continue button are visible and functional
6. **On `valid: false` with `"you already used your code"`**:
   - Invite code input shows the error (disabled)
   - **Hide** username input and Continue button entirely
   - Show a link: "Have an invite code? Enter it manually" → navigates to plain signup (clears ref state)
7. **On `valid: false` with any other error**:
   - Show error in disabled input
   - Show "Have an invite code? Enter it manually" link

#### "Have an invite code? Enter manually" behavior:
- Pressable text link shown below the invite code field
- On press:
  - Clear `referrerUsername`, reset `precheckStatus` to `idle`
  - Invite code input becomes an **empty, editable** input (normal mode)
  - User can now type an invite code manually
- This link is visible whenever the referral precheck fails, or when the user wants to override the referral

#### Submission changes:
- **Referral mode** (precheck valid): call `setUsername` with `{ username, referrer_username: referrerUsername }` — NO `invite_code`; skip invite code validation step
- **Normal/direct mode**: current flow unchanged — sends `invite_code`

---

## Phase 4: Verification & Cleanup

### 4.1 Type safety
- Run `bunx tsc --noEmit` to verify no type errors

### 4.2 Test the flows manually
- Referral deep link → precheck → "Invite code applied" → pick username → signup
- "Have an invite code? Enter manually" → clears referral → manual code entry
- Direct invite deep link → pre-fill code → signup
- Already-used-code state → blocked form → manual entry link works
- Toggle on/off on invite-and-earn screen → share box appears/disappears
- Copy referral link → paste in browser → verify URL format
- Dashboard period switching and pagination

### 4.3 Edge cases to handle
- Referrer runs out of codes between precheck and submit → account still created, no referral recorded (rare, no special UI needed)
- Self-referral → backend rejects with 400, show error
- Network errors during precheck → show retry or fallback to manual code entry
- `inviteCodeRequired` changes between nodes when user switches server
- User arrives via referral link but is already logged in → deep link should still route to username screen if no username set

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `src/api/types.ts` | Modify — add new types + update `UserStatusResponse` | 1 |
| `src/api/read/endpoints/referrals.ts` | **New** — precheck + summary endpoints | 1 |
| `src/api/read/endpoints/index.ts` | Modify — export new endpoints | 1 |
| `src/api/read/query-keys.ts` | Modify — add referral keys | 1 |
| `src/api/read/hooks/use-referrals.ts` | **New** — `useReferralPrecheck`, `useReferralSummary` | 1 |
| `src/api/read/hooks/index.ts` | Modify — export new hooks | 1 |
| `src/api/write/endpoints/username.ts` | Modify — `referrer` → `referrer_username` | 1 |
| `src/api/write/endpoints/referral-precheck-opt-in.ts` | **New** — opt-in toggle endpoint | 1 |
| `src/api/write/endpoints/index.ts` | Modify — export new endpoint | 1 |
| `src/api/write/index.ts` | Modify — export new endpoint | 1 |
| `src/pages/invite-and-earn-screen.tsx` | **Major modify** — referral toggle, share box, referrals dashboard | 2 |
| `src/utils/internal-link-handler.ts` | Modify — add `signup` link type with `?ref=` | 3 |
| `app/+native-intent.ts` | Modify — handle signup deep links | 3 |
| `app/(auth)/username.tsx` | **Major modify** — referral precheck flow, "code applied" UI, "enter manually" link | 3 |

**New files: 3** | **Modified files: 11** | **Estimated scope: Medium-Large**

---

## Implementation Order

```
Phase 1 (API layer)              → no UI changes, can be done first
Phase 2 (Invite & Earn screen)   → depends on Phase 1
Phase 3 (Deep links + Username)  → depends on Phase 1
Phase 4 (Verification)           → after all phases
```

Phases 2 and 3 can be done in parallel after Phase 1 is complete.
