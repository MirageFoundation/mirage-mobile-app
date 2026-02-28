# Delete Account Feature — Implementation Plan

## Overview

Add a "Delete Account" option to the Settings screen. Tapping it navigates to a confirmation page with a `DELETE` text confirmation input, then calls the `POST /api/core/delete_user` endpoint and logs the user out on success.

---

## User Flow

1. User opens **Settings**
2. Scrolls to new **"Danger Zone"** section at the bottom
3. Taps **"Delete Account"** row (red, with `trash-outline` icon)
4. Navigates to **`/delete-account`** screen
5. Sees warning text:
   > "This submits an account deletion request to the network. Most nodes will honor it, but some may not — full removal cannot be guaranteed."
6. Sees a text input with placeholder **"Type DELETE to confirm"**
7. **"Delete Account"** button is **disabled** until input value is exactly `"DELETE"` (uppercase, no extra chars)
8. On press → calls `deleteUser()` endpoint → on success → calls `logout()` from auth store → user lands on login screen

---

## Files to Create

### 1. `src/api/write/signing/canonical.ts` — Add `canonBaseDeleteUser`

Add a new canonical builder alongside the existing ones. Follows the same pattern as `canonBaseDelete` but with `MsgDeleteUser` prefix and tag 100 for `target` (mirage1 address, not a txhash).

```ts
// --- MsgDeleteUser (Account Deletion) ---

export interface DeleteUserParams extends BaseParams {
  /** mirage1... address to delete (must match pubkey) */
  target: string;
}

export function canonBaseDeleteUser(params: DeleteUserParams): Uint8Array {
  return concatBytes(
    prefix("MsgDeleteUser"),
    encodeHeader(params),
    encString(100, params.target)
  );
}
```

**Location**: Append to end of `src/api/write/signing/canonical.ts`

**Export from**: `src/api/write/signing/index.ts` — add `canonBaseDeleteUser` and `type DeleteUserParams`

---

### 2. `src/api/write/endpoints/delete-user.ts` — New endpoint file

Follows the same pattern as `username.ts`.

```ts
// POST /core/delete_user

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseDeleteUser } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

export interface DeleteUserInput {
  target: string; // mirage1... address
}

export async function deleteUser(
  wallet: MirageWallet,
  input: DeleteUserInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseDeleteUser,
      payloadFields: {
        target: input.target.toLowerCase(),
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/delete_user", payload);
  }, "deleteUser");
}
```

**Register in**: `src/api/write/endpoints/index.ts` — add export for `deleteUser` and `DeleteUserInput`

---

### 3. `src/api/write/hooks/use-delete-user.ts` — New mutation hook

Follows `use-set-username.ts` pattern. On success, calls `useAuthStore.getState().logout()`.

```ts
import { useMutation } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { useAuthStore } from "@/src/stores";
import { deleteUser } from "../endpoints/delete-user";
import type { PoWProgress } from "../signing";

export interface UseDeleteUserOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export function useDeleteUser(options: UseDeleteUserOptions = {}) {
  const { getWallet, address } = useWallet();
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationFn: async () => {
      const wallet = await getWallet();
      return deleteUser(wallet, { target: wallet.address }, options.onPoWProgress);
    },
    onSuccess: async () => {
      await logout();
    },
  });
}
```

**Register in**: `src/api/write/hooks/index.ts` — add `useDeleteUser` export
**Register in**: `src/api/write/index.ts` — add `useDeleteUser`, `deleteUser`, `DeleteUserInput` exports

---

### 4. `app/delete-account.tsx` — Route file

Thin route wrapper (matches existing pattern like `app/settings.tsx`):

```ts
import { DeleteAccountScreen } from "@/src/pages";

export default function DeleteAccount() {
  return <DeleteAccountScreen />;
}
```

---

### 5. `src/pages/delete-account-screen.tsx` — Screen implementation

Full screen with:
- Header (back button + title "Delete Account") — same style as settings-screen header
- Warning text block (styled with error/subtle colors)
- `TextInput` with placeholder "Type DELETE to confirm"
- "Delete Account" button (red, disabled until input === "DELETE")
- `TransactionProgressModal` for PoW progress
- On success → `logout()` is called by the hook

```
┌─────────────────────────────────┐
│  ← Delete Account               │
├─────────────────────────────────┤
│                                 │
│  ⚠️ icon                        │
│                                 │
│  This submits an account        │
│  deletion request to the        │
│  network. Most nodes will       │
│  honor it, but some may not —   │
│  full removal cannot be         │
│  guaranteed.                    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Type DELETE to confirm  │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │    Delete Account       │    │ ← disabled unless "DELETE"
│  └─────────────────────────┘    │
│                                 │
└─────────────────────────────────┘
```

Key behaviors:
- Uses `useDeleteUser` hook
- Uses `useTransactionProgress` + `executeWithProgress` for PoW tracking
- Button validates `confirmText.trim() === "DELETE"` — nothing else enables it
- On successful deletion, the hook's `onSuccess` calls `logout()` which clears wallet, resets stores, and redirects to auth

**Register in**: `src/pages/index.ts` — add `DeleteAccountScreen` export

---

### 6. `app/_layout.tsx` — Register route

Add `delete-account` screen to the Stack:

```tsx
<Stack.Screen
  name="delete-account"
  options={{
    animation: "slide_from_right",
  }}
/>
```

---

### 7. `src/pages/settings-screen.tsx` — Add "Danger Zone" section

Add a new section at the end of the `sections` array (before the `__DEV__` sections):

```ts
{
  title: "Danger Zone",
  data: [
    {
      id: "delete-account",
      component: (
        <SettingRow
          type="navigate"
          icon="trash-outline"
          title="Delete Account"
          subtitle="Permanently delete your account"
          onPress={() => router.push("/delete-account")}
          destructive // if SettingRow supports it, otherwise style with red text
        />
      ),
    },
  ],
},
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/api/write/signing/canonical.ts` | **Edit** | Add `DeleteUserParams` interface + `canonBaseDeleteUser` function |
| `src/api/write/signing/index.ts` | **Edit** | Export `canonBaseDeleteUser` + `DeleteUserParams` |
| `src/api/write/endpoints/delete-user.ts` | **Create** | `deleteUser()` endpoint function |
| `src/api/write/endpoints/index.ts` | **Edit** | Export `deleteUser`, `DeleteUserInput` |
| `src/api/write/hooks/use-delete-user.ts` | **Create** | `useDeleteUser` mutation hook |
| `src/api/write/hooks/index.ts` | **Edit** | Export `useDeleteUser` |
| `src/api/write/index.ts` | **Edit** | Export new endpoint + hook + types |
| `app/delete-account.tsx` | **Create** | Route wrapper |
| `app/_layout.tsx` | **Edit** | Register `delete-account` route in Stack |
| `src/pages/delete-account-screen.tsx` | **Create** | Full delete account confirmation screen |
| `src/pages/index.ts` | **Edit** | Export `DeleteAccountScreen` |
| `src/pages/settings-screen.tsx` | **Edit** | Add "Danger Zone" section with delete row |

---

## Signing Protocol Details

From the API reference doc:

- **Message type prefix**: `"mirage.core.v1:MsgDeleteUser\x00"`
- **Canonical base tags** (in order): tag 2 (pubkey), tag 3 (block_hash), tag 4 (difficulty), tag 6 (timestamp), tag 100 (target address as string)
- **Canonical signed** = base + tag 5 (pow) inserted between tag 4 and tag 6
- **Signature** = `secp256k1_sign(SHA256(canonical_signed), private_key)` → 64-byte compact
- **PoW**: Required for free-tier users (same argon2id as all other messages). Subscribers set `pow_difficulty: 0`, `pow: 0`
- **Tag 100** encodes as single byte `0x64` — the existing `encString(100, target)` already handles this correctly since `encString` uses the tag value directly as a byte

The `buildSignedEnvelope` utility handles all PoW computation, retry logic, and signing automatically — the endpoint function just needs to provide the correct `baseBuilder` (`canonBaseDeleteUser`).

---

## Post-Deletion Behavior

On success (hook's `onSuccess`):
1. `useAuthStore.getState().logout()` is called, which:
   - Clears wallet from secure storage via `walletService.clearWallet()`
   - Resets Sentry user to `null`
   - Resets all auth state (user, isLoggedIn, walletAddress, etc.)
   - Resets `HomePostCardStore`, `ContentModerationStore`, `InboxStore`
2. The app automatically redirects to the auth/login screen since `isLoggedIn` becomes `false`

---

## Edge Cases

- **Network error during deletion**: `TransactionProgressModal` shows error state, user can dismiss and retry
- **PoW takes long**: Progress modal shows computing phase with attempt count / estimated time
- **User types "delete" (lowercase)**: Button stays disabled — must be exactly `"DELETE"`
- **User types "DELETE " (trailing space)**: Button stays disabled — `confirmText.trim() === "DELETE"` could be used but strict exact match `confirmText === "DELETE"` is safer to force deliberate input
- **User navigates back**: No side effects, nothing is submitted
- **Stale block hash**: `withPowRetry` handles automatic retry (up to 3 attempts)
