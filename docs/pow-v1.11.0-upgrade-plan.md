# PoW v1.11.0 Upgrade Plan

> Status: Draft  
> Date: 2026-02-14  
> Scope: Migrate from leading-zero-bits PoW to step-based target difficulty system

---

## Summary of Changes

The v1.11.0 backend moves from a simple "count leading zero bits" PoW check to a **step-based target difficulty** system. The mining algorithm (Argon2id) and canonical byte format remain the same, but:

1. **New parameters** from `/api/get_parameters`: `pow_base_bits`, `pow_factor`
2. **New difficulty check**: `hash_int <= effective_target` instead of `leadingZeroBits(hash) >= requiredBits`
3. **Free users always mine**, even when `pow_difficulty = 0` (base difficulty)
4. **Subscriber skip logic** now checks `user_level` from parameters (already partially done)
5. **No PoW exemptions** for `upgrade_level` and `set_auto_renewal` (already correct)

---

## Current State vs v1.11.0 Required State

| Area | Current Implementation | v1.11.0 Required |
|------|----------------------|-------------------|
| **Parameters API** | Returns `last_block_hash`, `pow_difficulty` | Must also return `pow_base_bits`, `pow_factor`, `user_level` |
| **ParametersResponse type** | Missing `pow_base_bits`, `pow_factor`, `user_level` | Add all three fields |
| **PoW difficulty check** | `leadingZeroBits(digest) >= requiredBits` | `bigint(digest) <= effective_target` (target-based) |
| **Difficulty interpretation** | `pow_difficulty` = number of leading zero bits | `pow_difficulty` = step count; combined with `pow_base_bits` + `pow_factor` to compute target |
| **Free user with difficulty=0** | Skips PoW (`requiredBits === 0` → return immediately) | Must still mine at base difficulty (`pow_base_bits` leading zeros equivalent) |
| **PoW input to miners** | `requiredBits: number` | Needs `pow_difficulty`, `pow_base_bits`, `pow_factor` |
| **Envelope builder** | Skips PoW when `difficulty === 0` for free users | Must mine when free user, regardless of `pow_difficulty` value |
| **Estimate PoW time** | Based on `2^difficulty` attempts | Based on `difficulty_factor` and `pow_base_bits` |

---

## Implementation Plan

### Phase 1: Type & API Changes

#### Task 1.1 — Update `ParametersResponse` type
**File**: `src/api/types.ts:35-40`

Add the new fields to the response interface:

```ts
export interface ParametersResponse {
  last_block_hash: string;
  pow_difficulty: number;
  pow_base_bits: number;    // NEW: base leading zero bits
  pow_factor: number;       // NEW: scaling factor per step (0, 1]
  balance?: number;
  user_level: number;       // NEW: 0 = free, 1+ = subscriber
}
```

#### Task 1.2 — Update `PoWInput` type
**File**: `src/wallet/pow.ts` and `src/wallet/pow-turbo.ts`

Replace `requiredBits: number` with the new three-parameter system:

```ts
export interface PoWInput {
  base: Uint8Array;
  lastBlockHash: string;
  powDifficulty: number;    // step count (was requiredBits)
  powBaseBits: number;      // base leading zero bits
  powFactor: number;        // scaling factor per step
}
```

Also update the re-export in `src/wallet/index.ts`.

---

### Phase 2: Target-Based Difficulty Check

#### Task 2.1 — Implement `difficultyFactor()` function
**File**: `src/wallet/pow.ts` (new function)

```ts
const BASE_DIFFICULTY_FACTOR = 1000n;

function difficultyFactor(steps: number, powFactor: number): bigint {
  if (steps === 0) return BASE_DIFFICULTY_FACTOR;
  // factor = 1000 * (1 + pow_factor) ^ steps, rounded half-up
  let factor = 1000;
  for (let i = 0; i < steps; i++) {
    factor *= (1 + powFactor);
  }
  return BigInt(Math.round(factor));
}
```

#### Task 2.2 — Implement `checkPowTarget()` function
**File**: `src/wallet/pow.ts` (new function, replaces `leadingZeroBits` check)

```ts
function checkPowTarget(
  digestBytes: Uint8Array,
  powDifficulty: number,
  powBaseBits: number,
  powFactor: number
): boolean {
  const factor = difficultyFactor(powDifficulty, powFactor);
  const baseTarget = 1n << BigInt(256 - powBaseBits);
  const effectiveTarget = (baseTarget * BASE_DIFFICULTY_FACTOR) / factor;
  
  // Convert digest to bigint (big-endian)
  let hashInt = 0n;
  for (const byte of digestBytes) {
    hashInt = (hashInt << 8n) | BigInt(byte);
  }
  
  return hashInt <= effectiveTarget;
}
```

#### Task 2.3 — Update `computePoW()` in `src/wallet/pow.ts`
Replace the `leadingZeroBits(digest) >= requiredBits` check with `checkPowTarget(digest, powDifficulty, powBaseBits, powFactor)`.

Also remove the early return for `requiredBits === 0` — free users with `pow_difficulty=0` still need to mine at base difficulty. The only skip is for subscribers (handled in envelope builder).

#### Task 2.4 — Update `computePoW()` in `src/wallet/pow-turbo.ts`
The turbo module calls into native code with `difficulty: requiredBits`. The native module needs to be updated to accept the new parameters OR we implement the target check on the JS side after getting the digest back.

**Option A** (Preferred): Update the native `react-native-argon2-turbo` module to accept `powBaseBits` and `powFactor` alongside `difficulty`, and do the target check in native code.

**Option B** (Fallback): If native module changes are not feasible short-term, temporarily use the JS `pow.ts` implementation with target-based checking, and migrate turbo later.

**Decision needed**: Which option to go with. Option A gives better performance, Option B is faster to ship.

---

### Phase 3: Envelope Builder Changes

#### Task 3.1 — Update `buildSignedEnvelope()` in `src/api/write/signing/envelope.ts`
**Key changes**:

1. Pass `pow_base_bits` and `pow_factor` from parameters through to `computePoW()`
2. Change the PoW-skip logic:
   - **Current**: `if (difficulty > 0)` → mine, else skip
   - **New**: `if (userLevel === 0)` → always mine (even when `pow_difficulty === 0`), else skip
3. For subscribers (`userLevel > 0`): send `pow_difficulty: 0`, `pow: 0`, `last_block_hash: ""` (empty)
4. Update `computePoW` call to pass new params:
   ```ts
   const powResult = await computePoW({
     base,
     lastBlockHash: params.last_block_hash,
     powDifficulty: params.pow_difficulty,
     powBaseBits: params.pow_base_bits,
     powFactor: params.pow_factor,
   }, progressCallback, maxAttempts);
   ```

#### Task 3.2 — Update `buildEnvelopeWithParams()` in the same file
Same changes as 3.1 but for the explicit-params variant. Caller will now need to supply `powBaseBits` and `powFactor`.

#### Task 3.3 — Update `EnvelopeParams` type if needed
**File**: `src/api/write/signing/types.ts`

No changes needed here — `EnvelopeParams` is for canonical byte building which doesn't change (difficulty field remains a single `number`).

---

### Phase 4: Estimate & Progress Updates

#### Task 4.1 — Update `estimatePoWTime()` in both `pow.ts` and `pow-turbo.ts`

Current: `expectedAttempts = 2^difficulty` (treats difficulty as bit count)  
New: Estimate based on effective target:

```ts
export function estimatePoWTime(
  powDifficulty: number,
  powBaseBits: number,
  powFactor: number
): number {
  const factor = difficultyFactor(powDifficulty, powFactor);
  // Expected attempts ≈ factor * 2^powBaseBits / 1000
  const expectedAttempts = Number(factor) * Math.pow(2, powBaseBits) / 1000;
  const hashesPerSecond = 320; // turbo: 320, fallback: 50
  return expectedAttempts / hashesPerSecond;
}
```

#### Task 4.2 — Update all callers of `estimatePoWTime()`
**File**: `src/api/write/signing/envelope.ts`

Pass the three params instead of just difficulty.

---

### Phase 5: Subscriber Block Hash Handling

#### Task 5.1 — Send empty `last_block_hash` for subscribers
**File**: `src/api/write/signing/envelope.ts`

Per the v1.11.0 spec, subscriber posts send `last_block_hash: ""`. Update:

```ts
if (userLevel > 0 || skipPoW) {
  difficulty = 0;
  // Subscribers don't need block hash
  // Set lastBlockHash to empty for the JSON payload
}
```

The canonical bytes still need the empty block hash bytes (0 length).

---

### Phase 6: Cleanup & Verification

#### Task 6.1 — Remove dead code
- `leadingZeroBits()` export from `src/wallet/index.ts` can be removed (or kept for `verifyPoW` if still needed)
- Legacy `createSignedEnvelope()` in `src/services/wallet-service.ts` (lines 270-320) uses an old signing format — verify if it's still called anywhere and remove/update

#### Task 6.2 — Update `verifyPoW()` in `src/wallet/pow.ts`
Update to use target-based check instead of leading zero bits.

#### Task 6.3 — Update `withPowRetry()` error matching
**File**: `src/api/write/utils/retry-pow.ts`

Verify the error messages still match what the v1.11.0 backend returns. The existing patterns (`"insufficient pow"`, `"invalid last_block_hash"`, `"stale"`) should still work but confirm.

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/api/types.ts` | Modify | Add `pow_base_bits`, `pow_factor`, `user_level` to `ParametersResponse` |
| `src/wallet/pow.ts` | Major rewrite | New `difficultyFactor()`, `checkPowTarget()`, update `computePoW()`, `estimatePoWTime()`, `verifyPoW()` |
| `src/wallet/pow-turbo.ts` | Modify | Update `PoWInput`, `computePoW()`, `estimatePoWTime()` |
| `src/wallet/index.ts` | Modify | Update re-exports for changed types |
| `src/api/write/signing/envelope.ts` | Modify | New PoW skip logic, pass new params, subscriber block hash handling |
| `src/api/write/signing/types.ts` | No change | `EnvelopeParams` unchanged |
| `src/api/write/signing/canonical.ts` | No change | Canonical byte format unchanged |
| `src/api/write/utils/retry-pow.ts` | Verify | Confirm error patterns still match |
| `src/services/wallet-service.ts` | Audit | Check if legacy `createSignedEnvelope()` is still used |

---

## Risk & Open Questions

1. **Native turbo module**: Does `react-native-argon2-turbo` need native code changes to support target-based checking? If yes, we need a native module release. If we do JS-side target check after native hashing, performance is the same (target check is cheap).

2. **Backward compatibility**: During rollout, will the backend accept both old (leading-zeros) and new (target-based) PoW? If not, we need a coordinated deploy.

3. **`user_level` source**: The spec says `user_level` comes from `/get_parameters`. We currently use `useAuthStore.getState().userLevel`. We should prefer the server response but keep the cached value as fallback.

4. **Free user `pow_difficulty=0`**: This is the biggest behavioral change. Currently `difficulty=0` means "skip PoW entirely". After upgrade, `difficulty=0` for a free user means "mine at base difficulty" (`2^pow_base_bits` expected attempts). This needs thorough testing.

---

## Testing Checklist

- [ ] Free user with `pow_difficulty=0` → PoW is mined (base difficulty)
- [ ] Free user with `pow_difficulty=3` → PoW is mined (harder)
- [ ] Subscriber → PoW skipped, `pow=0`, `pow_difficulty=0`, `last_block_hash=""`
- [ ] `upgrade_level` and `set_auto_renewal` → PoW skipped regardless of user level
- [ ] Target check matches backend validation (test with known digest/target pairs)
- [ ] `estimatePoWTime` gives reasonable estimates for common difficulty levels
- [ ] PoW retry logic still works on stale block hash rejection
- [ ] Progress UI still shows correct percentages during mining
- [ ] Turbo module (native parallel workers) works with new params
