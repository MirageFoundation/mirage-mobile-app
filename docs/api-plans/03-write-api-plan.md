# Write API Plan - POST Endpoints & Signing

> **Implementation Order: 3 of 3** (Read → Onboarding → Write)
>
> Implement last. Requires wallet from Onboarding layer for signing.
> Uses `useParameters` and `useUserStatus` from Read layer before each write.

## Directory Structure

```
src/api/write/
├── index.ts                    # Re-exports
├── hooks/
│   ├── index.ts
│   ├── use-set-username.ts
│   ├── use-post.ts
│   ├── use-comment.ts
│   ├── use-edit.ts
│   ├── use-vote.ts
│   ├── use-delete.ts
│   ├── use-follow.ts
│   ├── use-block.ts
│   ├── use-send-tokens.ts
│   ├── use-subscription.ts
│   └── use-report.ts
│
├── endpoints/
│   ├── index.ts
│   ├── username.ts
│   ├── posts.ts
│   ├── vote.ts
│   ├── social.ts
│   ├── moderation.ts
│   ├── tokens.ts
│   └── subscription.ts
│
└── signing/
    ├── index.ts
    ├── canonical.ts            # Canonical byte builders
    ├── envelope.ts             # Envelope creation
    ├── pow.ts                  # Proof of Work
    └── types.ts
```

---

## Signing Architecture

### Flow for Every Write Request

```
1. Get fresh parameters (last_block_hash, pow_difficulty)
2. Get user status (user_level)
3. Build canonical base bytes (without pow tag 5)
4. If free tier (level 0):
   - Compute PoW (Argon2id)
5. Insert pow tag 5 into signed bytes
6. SHA256 hash signed bytes
7. ECDSA sign with secp256k1 (64-byte compact, low-S)
8. Build JSON payload with envelope
9. POST to endpoint
10. Poll tx status for confirmation
```

### Canonical Bytes Format

**Structure:**
```
[prefix][tag2:pubkey][tag3:block_hash][tag4:difficulty][tag6:timestamp][tag100+:payload...]
```

**Prefix:** `mirage.core.v1:<MsgName>\x00`

**Tag encoding:**
- tag byte (1 byte)
- For bytes/string: uvarint(length) + raw bytes
- For uint64/int32/bool: uvarint(value)

**Important:**
- Tag 1 (authority) is NOT included
- Tag 5 (pow) is only in signed bytes, not base bytes
- Tag 10 (signature) is NOT included

---

## Canonical Byte Builders (`src/wallet/canonical.ts`)

### Core Utilities

```typescript
// Unsigned varint encoding
function uvarint(n: number | bigint): Uint8Array

// Concatenate Uint8Arrays
function concat(...parts: Uint8Array[]): Uint8Array

// Tag + bytes encoding
function encBytes(tag: number, data: Uint8Array): Uint8Array

// Tag + string encoding
function encString(tag: number, str: string): Uint8Array

// Tag + uvarint encoding
function encU64(tag: number, value: number | bigint): Uint8Array

// Message prefix
function prefix(msgName: string): Uint8Array
// Returns: "mirage.core.v1:{msgName}\x00"

// Insert pow tag 5 between tag 4 and tag 6
function canonSignedWithPow(base: Uint8Array, pow: number | bigint): Uint8Array
```

### Message-Specific Builders

Each returns **base bytes** (without tag 5). Call `canonSignedWithPow(base, pow)` before signing.

---

### `MsgSetUsername`

**Endpoint:** `POST /core/set_username`

**Canonical Tags:**
- 100: `target` (string, your address)
- 101: `username` (string)

```typescript
interface SetUsernameParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;    // Your mirage1... address
  username: string;
}

function canonBaseSetUsername(params: SetUsernameParams): Uint8Array
```

**API Body:**
```typescript
{
  pubkey: string;           // base64
  signature: string;        // base64
  timestamp: number;        // ms
  last_block_hash: string;  // hex
  pow_difficulty: number;
  pow: number;
  username: string;
  referrer?: string;        // Optional mirage1... address
}
```

---

### `MsgPost` (Post or Comment)

**Endpoint:** `POST /core/post`

**Canonical Tags:**
- 100: `target` (string, "" for post, parent txhash for comment)
- 101: `topic` (string, required for post, "" for comment)
- 102: `title` (string)
- 103: `content` (string)
- 104: `tag` (string: "", "sensitive", "porn", "gore", "violence", "death")

```typescript
interface PostParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;    // "" for post, parent_txhash for comment
  topic: string;     // Required for post, "" for comment
  title: string;
  content: string;
  tag: string;
}

function canonBasePost(params: PostParams): Uint8Array
```

**API Body:**
```typescript
{
  pubkey: string;
  signature: string;
  timestamp: number;
  last_block_hash: string;
  pow_difficulty: number;
  pow: number;
  target: string;
  topic: string;
  title: string;
  content: string;
  tag: string;
}
```

---

### `MsgEdit`

**Endpoint:** `POST /core/edit`

**Canonical Tags:**
- 100: `target` (string, "" for post edit, parent txhash for comment edit)
- 101: `topic` (string, required for posts, "" for comments)
- 102: `title` (string)
- 103: `content` (string)
- 104: `tag` (string)
- 105: `override` (string, txhash being edited)

```typescript
interface EditParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;
  topic: string;
  title: string;
  content: string;
  tag: string;
  override: string;  // txhash being edited
}

function canonBaseEdit(params: EditParams): Uint8Array
```

---

### `MsgVote`

**Endpoint:** `POST /core/vote`

**Canonical Tags:**
- 100: `target` (string, txhash)
- 101: `direction` (uvarint of uint32)

**CRITICAL - Direction Encoding:**
- `1` -> `1`
- `0` -> `0`
- `-1` -> `4294967295` (uint32 representation)

```typescript
interface VoteParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;     // txhash
  direction: number;  // 1, 0, -1
}

function canonBaseVote(params: VoteParams): Uint8Array {
  // Direction must be encoded as uint32
  const u32 = direction < 0 ? (direction >>> 0) : direction;
  // ...
}
```

---

### `MsgFollowModerator` / `MsgUnfollowModerator`

**Endpoints:** `POST /core/follow_moderator`, `POST /core/unfollow_moderator`

**Canonical Tags:**
- 100: `target` (string, your address)
- 101: `moderator` (string, mirage1... to follow)

```typescript
interface FollowModeratorParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;     // Your address
  moderator: string;  // Address to follow
}

function canonBaseFollowModerator(params: FollowModeratorParams): Uint8Array
function canonBaseUnfollowModerator(params: FollowModeratorParams): Uint8Array
```

---

### `MsgFollowUser` / `MsgUnfollowUser`

**Endpoints:** `POST /core/follow_user`, `POST /core/unfollow_user`

**Canonical Tags:**
- 100: `target` (string, your address)
- 101: `user` (string, mirage1... to follow)

```typescript
interface FollowUserParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;  // Your address
  user: string;    // Address to follow
}

function canonBaseFollowUser(params: FollowUserParams): Uint8Array
function canonBaseUnfollowUser(params: FollowUserParams): Uint8Array
```

---

### `MsgFollowTopic` / `MsgUnfollowTopic`

**Endpoints:** `POST /core/follow_topic`, `POST /core/unfollow_topic`

**Canonical Tags:**
- 100: `target` (string, your address)
- 101: `topic` (string, lowercase)

```typescript
interface FollowTopicParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;  // Your address
  topic: string;   // Lowercase topic name
}

function canonBaseFollowTopic(params: FollowTopicParams): Uint8Array
function canonBaseUnfollowTopic(params: FollowTopicParams): Uint8Array
```

---

### `MsgBlockPost` / `MsgUnblockPost`

**Endpoints:** `POST /core/block_post`, `POST /core/unblock_post`

**Canonical Tags:**
- 100: `target` (string, txhash)

```typescript
interface BlockPostParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;  // txhash to block
}

function canonBaseBlockPost(params: BlockPostParams): Uint8Array
function canonBaseUnblockPost(params: BlockPostParams): Uint8Array
```

---

### `MsgBlockUser` / `MsgUnblockUser`

**Endpoints:** `POST /core/block_user`, `POST /core/unblock_user`

**Canonical Tags:**
- 100: `target` (string, mirage1... address)

```typescript
interface BlockUserParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;  // Address to block
}

function canonBaseBlockUser(params: BlockUserParams): Uint8Array
function canonBaseUnblockUser(params: BlockUserParams): Uint8Array
```

---

### `MsgDelete`

**Endpoint:** `POST /core/delete_post`

**Canonical Tags:**
- 100: `target` (string, txhash)

```typescript
interface DeleteParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;  // txhash to delete
}

function canonBaseDelete(params: DeleteParams): Uint8Array
```

---

### `MsgSendTokens`

**Endpoint:** `POST /core/send_tokens`

**Canonical Tags:**
- 100: `sender` (string, your address)
- 101: `target` (string, recipient address)
- 102: `amount` (uvarint, integer umirage)

```typescript
interface SendTokensParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  sender: string;   // Your address
  target: string;   // Recipient address
  amount: number;   // umirage (integer)
}

function canonBaseSendTokens(params: SendTokensParams): Uint8Array
```

---

### `MsgUpgradeLevel` (Paid Tiers Only)

**Endpoint:** `POST /core/upgrade_level`

**Canonical Tags:**
- 100: `level` (uvarint, 1-3)

**Rules:**
- `pow_difficulty` MUST be 0
- `pow` MUST be 0

```typescript
interface UpgradeLevelParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  timestampMs: number;
  level: number;  // 1, 2, or 3
}

function canonBaseUpgradeLevel(params: UpgradeLevelParams): Uint8Array
```

---

### `MsgSetAutoRenewal` (Paid Tiers Only)

**Endpoint:** `POST /core/set_auto_renewal`

**Canonical Tags:**
- 100: `auto_renew` (uvarint, 1 for true, 0 for false)

**Rules:**
- `pow_difficulty` MUST be 0
- `pow` MUST be 0

```typescript
interface SetAutoRenewalParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  timestampMs: number;
  autoRenew: boolean;
}

function canonBaseSetAutoRenewal(params: SetAutoRenewalParams): Uint8Array
```

---

### Report (DB-backed, not on-chain)

**Endpoint:** `POST /core/report`

**Still requires PoW and signature verification.**

```typescript
interface ReportParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  target: string;  // txhash
  reason: string;  // max 200 chars
}

// Uses standard envelope + PoW
```

**Response:**
```typescript
{ success: true, id: number }
```

---

## Proof of Work Implementation (`src/wallet/pow.ts`)

### Argon2id Parameters

- **Time cost (t):** 1
- **Memory cost (m):** 4096 KiB
- **Parallelism (p):** 1
- **Output length:** 32 bytes

### PoW Computation

```typescript
// Use @noble/hashes (already installed via @noble/curves)
import { argon2id } from '@noble/hashes/argon2';

interface PowInput {
  base: Uint8Array;         // Canonical base bytes (no tag 5)
  lastBlockHash: string;    // Hex string
  requiredBits: number;     // From pow_difficulty
}

interface PowResult {
  pow: number;
  digest: Uint8Array;
}

async function computePow(input: PowInput): Promise<PowResult> {
  const salt = hexToBytes(input.lastBlockHash);
  const colon = new TextEncoder().encode(':');
  let pow = 0;
  
  while (true) {
    // password = base + ":" + uvarint(pow)
    const password = concat(input.base, colon, uvarint(pow));
    
    // @noble/hashes argon2id is synchronous but fast
    // Use asyncTick for progress updates on long operations
    const digest = argon2id(password, salt, {
      t: 1,        // time cost
      m: 4096,     // memory in KiB
      p: 1,        // parallelism
      dkLen: 32,   // output length
    });
    
    const zeroBits = leadingZeroBits(digest);
    if (zeroBits >= input.requiredBits) {
      return { pow, digest };
    }
    
    pow++;
    
    // Yield to event loop periodically to avoid blocking UI
    if (pow % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}
```

### Leading Zero Bits

```typescript
function leadingZeroBits(bytes: Uint8Array): number {
  let total = 0;
  for (const b of bytes) {
    if (b === 0) {
      total += 8;
      continue;
    }
    for (let i = 7; i >= 0; i--) {
      if (((b >> i) & 1) === 0) total++;
      else return total;
    }
  }
  return total;
}
```

---

## Envelope Builder (`src/wallet/envelope.ts`)

Uses Read API endpoints before every write operation.

```typescript
interface EnvelopeInput {
  wallet: MirageWallet;
  baseBuilder: (params: EnvelopeParams) => Uint8Array;
  payloadFields: Record<string, any>;
}

interface EnvelopeParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
}

async function buildSignedEnvelope(input: EnvelopeInput): Promise<SignedPayload> {
  // 1. Get fresh parameters (Read API)
  const params = await api.read.getParameters();
  const userStatus = await api.read.getUserStatus(input.wallet.address);
  
  // 2. Determine if PoW needed (level 0 = free tier)
  const isFree = userStatus.user_level === 0;
  const difficulty = isFree ? params.pow_difficulty : 0;
  
  // 3. Build base bytes
  const timestampMs = Date.now();
  const base = input.baseBuilder({
    pubkey33: input.wallet.publicKey,
    lastBlockHashBytes: hexToBytes(params.last_block_hash),
    difficulty,
    timestampMs,
    ...input.payloadFields,
  });
  
  // 4. Compute PoW if needed
  let pow = 0;
  if (isFree) {
    const powResult = await computePow({
      base,
      lastBlockHash: params.last_block_hash,
      requiredBits: difficulty,
    });
    pow = powResult.pow;
  }
  
  // 5. Build signed bytes (insert tag 5)
  const signedBytes = canonSignedWithPow(base, pow);
  
  // 6. Sign
  const signature = await signCanonical(input.wallet.privateKey, signedBytes);
  
  // 7. Return envelope
  return {
    pubkey: b64encode(input.wallet.publicKey),
    signature: b64encode(signature),
    timestamp: timestampMs,
    last_block_hash: params.last_block_hash,
    pow_difficulty: difficulty,
    pow,
    ...input.payloadFields,
  };
}
```

---

## Mutation Hooks Pattern

Mutation hooks depend on:
- **Onboarding layer**: `useWallet()` hook to get wallet for signing
- **Read layer**: Query keys for cache invalidation, `useTxStatusPolling` for confirmation

```typescript
// src/api/write/hooks/use-vote.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/api/read/query-keys';
import { useWallet } from '@/hooks/use-wallet';  // From Onboarding layer
import { vote } from '../endpoints/vote';

export function useVote() {
  const queryClient = useQueryClient();
  const { wallet, address } = useWallet();
  
  return useMutation({
    mutationFn: async ({ target, direction }: { target: string; direction: number }) => {
      if (!wallet) throw new Error('Wallet not initialized');
      return vote(wallet, target, direction);
    },
    onSuccess: (data, { target }) => {
      // Invalidate Read API queries
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.userStatus(address!) });
      
      // Return tx_hash for status polling
      return data.tx_hash;
    },
  });
}
```

### With TX Status Polling

```typescript
export function useVoteWithConfirmation() {
  const voteMutation = useVote();
  const [txHash, setTxHash] = useState<string | null>(null);
  const txStatus = useTxStatusPolling(txHash);
  
  const vote = async (target: string, direction: number) => {
    const result = await voteMutation.mutateAsync({ target, direction });
    setTxHash(result.tx_hash);
    return result;
  };
  
  return {
    vote,
    isPending: voteMutation.isPending,
    txHash,
    txStatus: txStatus.data,
    isConfirmed: txStatus.data?.found && txStatus.data?.indexed,
    error: voteMutation.error || txStatus.error,
  };
}
```

---

## All Write Endpoints Summary

| Endpoint | Message | PoW Required | Notes |
|----------|---------|--------------|-------|
| `POST /core/set_username` | MsgSetUsername | Level 0 only | Optional referrer field |
| `POST /core/post` | MsgPost | Level 0 only | target="" for post, txhash for comment |
| `POST /core/edit` | MsgEdit | Level 0 only | override = txhash being edited |
| `POST /core/vote` | MsgVote | Level 0 only | Direction: 1, 0, -1 |
| `POST /core/delete_post` | MsgDelete | Level 0 only | |
| `POST /core/follow_moderator` | MsgFollowModerator | Level 0 only | |
| `POST /core/unfollow_moderator` | MsgUnfollowModerator | Level 0 only | |
| `POST /core/follow_user` | MsgFollowUser | Level 0 only | |
| `POST /core/unfollow_user` | MsgUnfollowUser | Level 0 only | |
| `POST /core/follow_topic` | MsgFollowTopic | Level 0 only | |
| `POST /core/unfollow_topic` | MsgUnfollowTopic | Level 0 only | |
| `POST /core/block_post` | MsgBlockPost | Level 0 only | |
| `POST /core/unblock_post` | MsgUnblockPost | Level 0 only | |
| `POST /core/block_user` | MsgBlockUser | Level 0 only | |
| `POST /core/unblock_user` | MsgUnblockUser | Level 0 only | |
| `POST /core/send_tokens` | MsgSendTokens | Level 0 only | |
| `POST /core/upgrade_level` | MsgUpgradeLevel | **Never** | pow=0, difficulty=0 |
| `POST /core/set_auto_renewal` | MsgSetAutoRenewal | **Never** | pow=0, difficulty=0 |
| `POST /core/report` | - | Level 0 only | DB-backed, not on-chain |

---

## Response Format

All successful write requests return:

```typescript
interface WriteResponse {
  tx_hash: string;   // 64 hex chars
  code: number;      // 0 = success
  height: number;    // Often 0 initially (async broadcast)
  raw_log: string;
}
```

Use `GET /get_tx_status?hash=<tx_hash>` to poll for confirmation.

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "invalid signature" | Wrong canonical bytes or encoding | Check byte order, low-S normalization |
| "envelope_timestamp too old" | Device clock drift | Check NTP/time settings |
| "envelope_timestamp in future" | Device clock fast | Check NTP/time settings |
| "pow not allowed for subscribers" | Paid user sent PoW | Set pow=0, difficulty=0 |
| "insufficient pow" | PoW doesn't meet difficulty | Re-fetch params, recompute |

### Signature Debugging

If signatures fail:
1. Verify canonical bytes match exactly (use hex dump)
2. Ensure pow tag 5 is inserted in signed bytes
3. Check signature is 64-byte compact (not DER)
4. Verify low-S normalization
5. Check direction encoding for votes (-1 = 4294967295)
6. Verify timestamp in signed bytes matches JSON timestamp

---

## Mutation Hook Summary

| Hook | Endpoint | Notes |
|------|----------|-------|
| `useSetUsername` | `/core/set_username` | First write after onboarding |
| `usePost` | `/core/post` | target="" |
| `useComment` | `/core/post` | target=parent_txhash |
| `useEdit` | `/core/edit` | |
| `useVote` | `/core/vote` | |
| `useDelete` | `/core/delete_post` | |
| `useFollowModerator` | `/core/follow_moderator` | |
| `useUnfollowModerator` | `/core/unfollow_moderator` | |
| `useFollowUser` | `/core/follow_user` | |
| `useUnfollowUser` | `/core/unfollow_user` | |
| `useFollowTopic` | `/core/follow_topic` | |
| `useUnfollowTopic` | `/core/unfollow_topic` | |
| `useBlockPost` | `/core/block_post` | |
| `useUnblockPost` | `/core/unblock_post` | |
| `useBlockUser` | `/core/block_user` | |
| `useUnblockUser` | `/core/unblock_user` | |
| `useSendTokens` | `/core/send_tokens` | |
| `useUpgradeLevel` | `/core/upgrade_level` | No PoW |
| `useSetAutoRenewal` | `/core/set_auto_renewal` | No PoW |
| `useReport` | `/core/report` | DB-backed |

---

## Testing Checklist

- [ ] Canonical bytes match Python reference implementation
- [ ] Vote direction -1 encodes as 4294967295
- [ ] PoW computation produces valid proofs
- [ ] Signatures pass backend verification
- [ ] Paid tier requests work without PoW
- [ ] Free tier requests include valid PoW
- [ ] TX status polling works correctly
- [ ] Mutations invalidate correct queries
- [ ] Error messages display properly
- [ ] Optimistic updates work for votes
