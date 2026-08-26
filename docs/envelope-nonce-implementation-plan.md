# Envelope Nonce (`envelope_nonce`) Implementation Plan

## Summary

Chain v1.19.0 introduces an optional `envelope_nonce` field on every transaction for replay protection. It becomes **mandatory in v1.20.0**. We need to:

1. Generate a unique nonce per transaction
2. Include it as **tag 7** in canonical signing bytes (between tag 6 and tag 100+)
3. Send it as a string in every HTTP POST payload

---

## Current State (what exists today)

| File | Role |
|------|------|
| `src/api/write/signing/canonical.ts` | Builds canonical bytes. Header encodes tags 2,3,4,6. No tag 7 today. |
| `src/api/write/signing/envelope.ts` | `buildSignedEnvelope` / `buildEnvelopeWithParams` — orchestrates params → canonical bytes → PoW → sign → payload. |
| `src/api/write/signing/types.ts` | `SignedEnvelope` type (pubkey, signature, timestamp, last_block_hash, pow_difficulty, pow). No `envelope_nonce`. |
| `src/wallet/pow.ts` | `computePoW` uses base bytes for Argon2id hashing. Base bytes currently lack tag 7. |

---

## Implementation Steps

### Step 1: Add `generateEnvelopeNonce()` utility

**File:** `src/wallet/crypto.ts` (or new file `src/wallet/nonce.ts`)

```ts
export function generateEnvelopeNonce(): bigint {
  const tsNs = BigInt(Date.now()) * 1_000_000n;
  const rand = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
  const nonce = tsNs + rand;
  const MAX = (1n << 53n) - 1n;
  if (nonce > 0n && nonce <= MAX) return nonce;
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 999)) + 1n;
}
```

Constraints:
- Must be > 0 (zero = legacy / no protection)
- Must be <= 2^53 - 1 (JS-safe integer range)
- Must be unique per transaction per pubkey

---

### Step 2: Add tag 7 to canonical byte header

**File:** `src/api/write/signing/canonical.ts`

#### 2a. Update `BaseParams` to include nonce

```ts
export interface BaseParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  nonce: bigint;  // <-- NEW
}
```

#### 2b. Update `encodeHeader()` to emit tag 7 after tag 6

```ts
function encodeHeader(params: BaseParams): Uint8Array {
  return concatBytes(
    encBytes(2, params.pubkey33),
    encBytes(3, params.lastBlockHashBytes),
    encU64(4, params.difficulty),
    encU64(6, params.timestampMs),
    encU64(7, params.nonce),  // <-- NEW: tag 7 between tag 6 and payload
  );
}
```

#### 2c. Update `canonSignedWithPow()` — tag 5 insertion

`canonSignedWithPow` currently parses tag 2→3→4 then finds tag 6 to insert tag 5 before it. After this change, the sequence in base bytes is `...tag4, tag6, tag7, tag100+`. The function inserts tag 5 before tag 6, which is still correct — no change needed to insertion logic, just awareness that tag 7 now follows tag 6.

**Verify:** After insertion the signed byte order is: `...tag4, tag5(pow), tag6, tag7, tag100+` ✓

#### 2d. Update `UpgradeLevelParams` and `SetAutoRenewalParams`

These currently define their own param types without extending `BaseParams`. Add `nonce` to them or convert them to extend `BaseParams`.

---

### Step 3: Update `EnvelopeParams` type

**File:** `src/api/write/signing/types.ts`

```ts
export interface EnvelopeParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  nonce: bigint;  // <-- NEW
}
```

Add `envelope_nonce` to `SignedEnvelope`:

```ts
export interface SignedEnvelope {
  pubkey: string;
  signature: string;
  timestamp: number;
  last_block_hash: string;
  pow_difficulty: number;
  pow: number;
  envelope_nonce: string;  // <-- NEW: string representation of the nonce
}
```

---

### Step 4: Update envelope builders

**File:** `src/api/write/signing/envelope.ts`

In both `buildSignedEnvelope` and `buildEnvelopeWithParams`:

1. Generate nonce at the start: `const nonce = generateEnvelopeNonce();`
2. Pass `nonce` into `envelopeParams`
3. Include `envelope_nonce: nonce.toString()` in the returned payload object

```ts
// In buildSignedEnvelope:
const nonce = generateEnvelopeNonce();

const envelopeParams: EnvelopeParams = {
  pubkey33: wallet.publicKey,
  lastBlockHashBytes,
  difficulty,
  timestampMs,
  nonce,  // <-- NEW
};

// ... later in the return:
const envelope = {
  pubkey: b64encode(wallet.publicKey),
  signature: b64encode(signature),
  timestamp: timestampMs,
  last_block_hash: effectiveBlockHash,
  pow_difficulty: difficulty,
  pow,
  envelope_nonce: nonce.toString(),  // <-- NEW
  ...payloadFields,
} as SignedPayload<TPayload>;
```

Same pattern for `buildEnvelopeWithParams`.

---

### Step 5: Update `SignedEnvelope` in wallet types (if used separately)

**File:** `src/wallet/types.ts`

The `SignedEnvelope` interface here also needs `envelope_nonce: string`.

---

### Step 6: Export the nonce generator

**File:** `src/wallet/index.ts`

Export `generateEnvelopeNonce` so it's available from `@/src/wallet`.

---

## Files to Modify (Summary)

| # | File | Change |
|---|------|--------|
| 1 | `src/wallet/crypto.ts` | Add `generateEnvelopeNonce()` function |
| 2 | `src/wallet/index.ts` | Export `generateEnvelopeNonce` |
| 3 | `src/wallet/types.ts` | Add `envelope_nonce: string` to `SignedEnvelope` |
| 4 | `src/api/write/signing/types.ts` | Add `nonce` to `EnvelopeParams`, `envelope_nonce` to `SignedEnvelope` |
| 5 | `src/api/write/signing/canonical.ts` | Add `nonce` to `BaseParams`, emit `encU64(7, params.nonce)` in `encodeHeader`, update `UpgradeLevelParams`/`SetAutoRenewalParams` |
| 6 | `src/api/write/signing/envelope.ts` | Generate nonce, pass to params, include in HTTP payload as string |

---

## PoW Consideration

The PoW base bytes (used as input to Argon2id) must also include tag 7. Since `computePoW` in `src/wallet/pow.ts` receives the `base` bytes directly from the canonical builder, and we're adding tag 7 inside `encodeHeader`, the base bytes will automatically include the nonce. **No changes needed to `pow.ts`.**

---

## Verification Plan

1. **Smoke test:** Make any write action (vote, post, follow). Expect HTTP 200 with `tx_hash`.
2. **Replay test:** Replay the exact same signed payload. First → 200, second → error containing `"envelope replay"`.
3. **Edge cases:**
   - Nonce is always > 0
   - Nonce is sent as string in JSON (`"envelope_nonce": "1710000000000042"`)
   - Same nonce in canonical bytes and HTTP payload

---

## Error Reference

| Error | Meaning |
|-------|---------|
| `"envelope_nonce must be > 0"` | Sent `"0"` or missing |
| `"invalid envelope_nonce"` | Not a valid integer string |
| `"envelope replay: nonce already used"` | Reused nonce (expected in replay test) |
| Signature verification failed | Tag 7 mismatch between signed bytes and payload, or wrong position |

---

## Timeline

- **Now (v1.19.0):** Optional — app works without it but has no replay protection
- **v1.20.0:** Mandatory — requests without `envelope_nonce` will be rejected (HTTP 400)

**Priority: High** — should ship before v1.20.0 goes live.
