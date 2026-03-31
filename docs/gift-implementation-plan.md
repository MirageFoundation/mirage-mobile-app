# Gift Mirage & Gift Subscription — Implementation Plan

> Add "Gift Mirage" and "Gift Subscription" options to the post/comment options menu so users can gift tokens or a subscription to the post author.
>
> **UI pattern:** Both sheets follow the same BottomSheet pattern as the existing `AwardPickerSheet` (`src/components/molecules/award-picker-sheet.tsx`). Same header, close button, balance row, and full-width confirm button style.

---

## 1. Backend Endpoints (mirage-node — already exist)

### 1a. Gift Mirage (Send Tokens)

| Field | Value |
|---|---|
| **Endpoint** | `POST /api/core/send_tokens` |
| **Message type** | `MsgSendTokens` / `/mirage.core.v1.MsgSendTokens` |
| **PoW** | Required for free users; skipped for subscribers |
| **Canonical builder** | `canon_base_send_tokens(pubkey, block_hash, difficulty, timestamp, sender, target, amount, nonce)` |

**Request body:**
```json
{
  "pubkey": "<base64>",
  "signature": "<base64>",
  "last_block_hash": "<hex64>",
  "pow_difficulty": 0,
  "pow": 0,
  "timestamp": 1711900000000,
  "envelope_nonce": 123456789,
  "target": "mirage1abc...",
  "amount": 1000000
}
```

**Key behavior:**
- `target` = recipient mirage1 address (post author's address)
- `amount` = integer in umirage (1 MIRAGE = 1,000,000 umirage)
- Backend prechecks: balance >= amount, valid target address
- On success: records inbox `donation` event + push notification to recipient
- **Already implemented in app** as `sendTokens()` in `src/api/write/endpoints/tokens.ts`

> **Note:** This is different from "Give Award" which has 4 fixed award types with preset costs. Gift Mirage lets the user type any custom amount.

---

### 1b. Gift Subscription

| Field | Value |
|---|---|
| **Endpoint** | `POST /api/core/subscribe` |
| **Message type** | `MsgSubscribe` / `/mirage.core.v1.MsgSubscribe` |
| **PoW** | **Not allowed** (paid operation, difficulty & pow must be 0) |
| **Canonical builder** | `canon_base_subscribe(pubkey, block_hash, 0, timestamp, level, target, nonce)` |

**Request body:**
```json
{
  "pubkey": "<base64>",
  "signature": "<base64>",
  "last_block_hash": "<hex64>",
  "timestamp": 1711900000000,
  "envelope_nonce": 123456789,
  "level": 1,
  "target": "mirage1abc..."
}
```

**Key behavior:**
- `level` = `1` (Subscriber) or `10` (Agent)
- `target` = recipient mirage1 address (empty string = self-subscribe)
- When `target` is set and differs from signer → **gift mode**
- Backend prechecks:
  - Payer balance >= tier `period_fee` (from chain params `tiers[level].period_fee`)
  - Recipient's current level must be <= requested level (can't downgrade)
  - Error code `gift_rejected_higher_tier` if recipient already has a higher tier
- On success: records inbox `subscription_gift` event + push notification
- **NOT yet implemented in app** — needs new `giftSubscription()` endpoint function

---

## 2. Frontend Canonical Signing

### 2a. `canonBaseSendTokens` — Already exists

File: `src/api/write/signing/canonical.ts`

```
prefix("MsgSendTokens") + encodeHeader(params) +
encString(100, sender) + encString(101, target) + encU64(102, amount)
```

### 2b. `canonBaseGiftSubscription` — Needs to be added

Must match the backend `canon_base_subscribe`:

```
prefix("MsgSubscribe") + encodeHeader({...params, difficulty: 0}) +
encU64(100, level) + encString(101, target)
```

- `difficulty` is always `0`
- `target` is the recipient address (only included when gifting, empty string for self)
- `encString(101, target)` — field tag 101 for the target address

---

## 3. UI Specifications

> Both sheets follow the `AwardPickerSheet` pattern: `BottomSheetModal` → `BottomSheetView` → header with title + close button → content → full-width confirm button → safe area footer.

### 3a. Gift Mirage Sheet

**Layout (top to bottom):**

```
┌─────────────────────────────────────┐
│  Donate to @username            ✕   │  ← header (bold title + close)
├─────────────────────────────────────┤
│  Balance: 12,500 MIRAGE             │  ← balance row (same as award sheet)
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │  Enter amount (MIRAGE)      │    │  ← TextInput, numeric keyboard
│  └─────────────────────────────┘    │
│  ⚠ Insufficient balance             │  ← error text (red, only when amount > balance)
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │         Send                │    │  ← confirm button (brand color, full width, pill)
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

**Behavior:**
- Title: **"Donate to @{username}"**
- Balance row shows user's current MIRAGE balance (formatted with `formatCompactNumber`)
- TextInput: numeric-only, placeholder "Enter amount (MIRAGE)"
- **Real-time validation:** if typed amount (in MIRAGE) × 1,000,000 > user balance:
  - Show red error text below input: **"Insufficient balance"**
  - Disable the Send button (opacity 0.5, `theme.colors.background.subtle` bg)
- Also disable Send if amount is empty or 0
- On send: convert MIRAGE → umirage (`amount * 1_000_000`), call `sendTokens()`
- Loading state: show `ActivityIndicator` in button (same as award sheet)
- On success: haptic + toast "{amount} MIRAGE sent!" + dismiss
- On error: haptic + toast with friendly error message

### 3b. Gift Subscription Sheet

**Layout (top to bottom):**

```
┌─────────────────────────────────────┐
│  Gift Subscription              ✕   │  ← header
├─────────────────────────────────────┤
│  Balance: 12,500 MIRAGE             │  ← balance row
├─────────────────────────────────────┤
│                                     │
│  Gift subscription to @username?    │  ← main prompt text (md, weight medium)
│  (100,000 MIRAGE)                   │  ← cost in MIRAGE (brand color, bold)
│                                     │
│  Until Apr 30, 2026                 │  ← subtitle (subtle text, "MMM DD, YYYY" format)
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │    Confirm Gift             │    │  ← confirm button
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

**Behavior:**
- Title: **"Gift Subscription"**
- Balance row same as award sheet
- Main text: **"Gift subscription to @{username}?"**
- Cost line: **"(100,000 MIRAGE)"** — read from chain params `tiers[1].period_fee` (Subscriber tier), formatted as MIRAGE
- Subtitle: **"Until {date}"** — compute expiry as `today + subscription_period` from chain params, format as `"MMM DD, YYYY"` (e.g. "Apr 30, 2026")
- **Validation:** if `period_fee > user balance`:
  - Button text changes to **"Insufficient Balance"**
  - Button disabled (opacity 0.5, subtle bg)
- On confirm: call `giftSubscription({ recipient, level: 1 })`
- Loading: `ActivityIndicator` in button
- On success: haptic + toast "Subscription gifted to @{username}!" + dismiss
- On error: haptic + toast with friendly error

**Note on subscription level:** For now, the gift subscription sheet gifts **Subscriber (level 1)** only. If we want to support gifting Agent (level 10) in the future, we can add a tier selector similar to the award options list.

---

## 4. Implementation Steps

### Step 1: Add `canonBaseGiftSubscription` to signing

**File:** `src/api/write/signing/canonical.ts`

```ts
export interface GiftSubscriptionParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  timestampMs: number;
  envelopeNonce: bigint;
  level: number;       // 1 or 10
  target: string;      // recipient mirage1 address
}

export function canonBaseGiftSubscription(params: GiftSubscriptionParams): Uint8Array {
  const baseParams: BaseParams = {
    pubkey33: params.pubkey33,
    lastBlockHashBytes: params.lastBlockHashBytes,
    difficulty: 0,
    timestampMs: params.timestampMs,
    envelopeNonce: params.envelopeNonce,
  };
  return concatBytes(
    prefix("MsgSubscribe"),
    encodeHeader(baseParams),
    encU64(100, params.level),
    encString(101, params.target)
  );
}
```

Export from `src/api/write/signing/index.ts`.

### Step 2: Add `giftSubscription()` endpoint

**File:** `src/api/write/endpoints/tokens.ts`

```ts
export interface GiftSubscriptionInput {
  recipient: string;
  level: SubscriptionLevel;
}

export async function giftSubscription(
  wallet: MirageWallet,
  input: GiftSubscriptionInput
): Promise<WriteResponse> {
  const { recipient, level } = input;

  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseGiftSubscription,
    payloadFields: {
      level,
      target: recipient,
    },
    skipPoW: true,
  });

  return api.post<WriteResponse>("/core/subscribe", payload);
}
```

### Step 3: Add hooks

**File:** `src/api/write/hooks/use-gift-subscription.ts`

Follow the same pattern as `use-award.ts`:
- Accept `recipient` (mirage1 address) + `level` (1 or 10)
- Call `giftSubscription(wallet, { recipient, level })`
- Invalidate relevant queries on success

### Step 4: Add "Gift Mirage" and "Gift Subscription" to post options

**Files:**
- `src/components/molecules/post-options-sheet.tsx`
- `src/components/molecules/comment-options-sheet.tsx`

Add two new `<MenuItem>` entries (only visible for non-own posts), next to the existing "Give Award":

```tsx
{!isOwnPost && (
  <MenuItem
    iconName="cash-outline"
    title="Gift Mirage"
    onPress={handleGiftMirage}
  />
)}

{!isOwnPost && (
  <MenuItem
    iconName="diamond-outline"
    title="Gift Subscription"
    onPress={handleGiftSubscription}
  />
)}
```

### Step 5: Create `GiftMirageSheet`

**File:** `src/components/molecules/gift-mirage-sheet.tsx`

Props:
```ts
type GiftMirageSheetProps = {
  recipientAddress: string;
  recipientUsername: string;
  onDismiss?: () => void;
  onSuccess?: () => void;
};

type GiftMirageSheetRef = {
  present: () => void;
  dismiss: () => void;
};
```

Component structure (mirror `AwardPickerSheet`):
- `BottomSheetModal` with `enableDynamicSizing`, backdrop, same background/handle styles
- Header: "Donate to @{username}" + close button
- Balance row: "Balance: {formatted} MIRAGE"
- `TextInput` with `keyboardType="numeric"`, `placeholder="Enter amount (MIRAGE)"`
- Error row (conditional): red "Insufficient balance" text when `parsedAmount * 1_000_000 > balance`
- Send button: disabled when `!amount || amount <= 0 || insufficientBalance || isSending`
- Use `useSendTokens` hook or call `sendTokens()` directly
- Haptics + toast on success/error (same pattern as award sheet)

### Step 6: Create `GiftSubscriptionSheet`

**File:** `src/components/molecules/gift-subscription-sheet.tsx`

Props:
```ts
type GiftSubscriptionSheetProps = {
  recipientAddress: string;
  recipientUsername: string;
  onDismiss?: () => void;
  onSuccess?: () => void;
};

type GiftSubscriptionSheetRef = {
  present: () => void;
  dismiss: () => void;
};
```

Component structure:
- `BottomSheetModal` (same shell as award sheet)
- Header: "Gift Subscription" + close button
- Balance row: "Balance: {formatted} MIRAGE"
- Prompt text: "Gift subscription to @{username}?" (size md, weight medium)
- Cost: "(100,000 MIRAGE)" (formatted from `tiers[1].period_fee / 1_000_000`, brand color, bold)
- Subtitle: "Until {expiryDate}" — compute `new Date(Date.now() + subscriptionPeriodMs)`, format as `"MMM DD, YYYY"` using `toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`
- Confirm button: "Confirm Gift" or "Insufficient Balance" when `periodFee > balance`
- Use `useGiftSubscription` hook
- Haptics + toast on success/error

### Step 7: Wire up handlers in post-options-sheet & comment-options-sheet

- Add refs for both new sheets
- Pass `postAuthorAddress` + `postAuthorUsername` as props
- `handleGiftMirage` → dismiss options → `giftMirageSheetRef.current?.present()`
- `handleGiftSubscription` → dismiss options → `giftSubscriptionSheetRef.current?.present()`

---

## 5. Files to Create / Modify

| Action | File |
|---|---|
| **Modify** | `src/api/write/signing/canonical.ts` — add `canonBaseGiftSubscription` |
| **Modify** | `src/api/write/signing/index.ts` — export new canonical |
| **Modify** | `src/api/write/endpoints/tokens.ts` — add `giftSubscription()` |
| **Modify** | `src/api/write/endpoints/index.ts` — export new function |
| **Create** | `src/api/write/hooks/use-gift-subscription.ts` |
| **Modify** | `src/api/write/hooks/index.ts` — export new hook |
| **Create** | `src/components/molecules/gift-mirage-sheet.tsx` |
| **Create** | `src/components/molecules/gift-subscription-sheet.tsx` |
| **Modify** | `src/components/molecules/index.ts` — export new sheets |
| **Modify** | `src/components/molecules/post-options-sheet.tsx` — add menu items + handlers |
| **Modify** | `src/components/molecules/comment-options-sheet.tsx` — add menu items + handlers |

---

## 6. Error Handling

| Error Code | Meaning | User Message |
|---|---|---|
| `insufficient_balance` | Payer doesn't have enough tokens | "Insufficient balance" |
| `gift_rejected_higher_tier` | Recipient already has a higher tier | "User already has a higher subscription tier" |
| `gift_invalid_target` | Invalid recipient address | "Invalid recipient address" |
| `indexer_unavailable` | DB error | "Service temporarily unavailable" |

---

## 7. UX Flow

### Gift Mirage (from post options)
1. User taps "..." on a post → options sheet opens
2. User taps "Gift Mirage"
3. Options sheet dismisses → Gift Mirage sheet opens
4. Shows "Donate to @username" + balance + amount input
5. User types amount → real-time validation against balance
6. If amount > balance → "Insufficient balance" error + button disabled
7. User taps "Send" → PoW runs (if free user) → tx broadcast
8. Success toast "{amount} MIRAGE sent!" → sheet closes

### Gift Subscription (from post options)
1. User taps "..." on a post → options sheet opens
2. User taps "Gift Subscription"
3. Options sheet dismisses → Gift Subscription sheet opens
4. Shows "Gift subscription to @username? (100,000 MIRAGE)" + "Until Apr 30, 2026"
5. If cost > balance → button shows "Insufficient Balance" + disabled
6. User taps "Confirm Gift" → tx broadcast (no PoW)
7. Success toast "Subscription gifted to @username!" → sheet closes

---

## 8. Notes

- **Gift Mirage** is different from **Give Award**: awards have 4 fixed types with preset costs; Gift Mirage is a free-form amount input
- **Gift Mirage** reuses the existing `sendTokens` flow — we just need the UI sheet with amount input + validation
- **Gift Subscription** is a new signing flow (`MsgSubscribe` with `target`) — requires `canonBaseGiftSubscription`
- Both features are hidden for own posts (`!isOwnPost`)
- The existing `upgradeLevel()` calls `/core/upgrade_level` (self-subscribe only). Gift subscription uses `/core/subscribe` with `target` field
- Subscription tier costs come from `useParameters()` → `tiers[idx].period_fee`
- The subscription expiry date is computed as `today + subscription_period` from chain params (`subscription_period` field)
- Reference component for sheet UI pattern: `src/components/molecules/award-picker-sheet.tsx`
