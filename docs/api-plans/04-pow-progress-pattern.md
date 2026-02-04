# PoW Transaction Progress Pattern

> **Reusable pattern for showing progress during blockchain transactions**
>
> Use this pattern whenever you need to submit a transaction that requires Proof of Work (PoW) computation.

## Overview

All write operations on Mirage (posting, voting, following, etc.) require:
1. Fetching fresh parameters (block hash, difficulty)
2. Computing Proof of Work (for free tier users)
3. Signing the transaction
4. Submitting to the API
5. Polling for blockchain confirmation

This process can take 10-60+ seconds depending on network difficulty. The `TransactionProgressModal` and `useTransactionProgress` hook provide a reusable way to show this progress to users.

---

## Components & Hooks

### TransactionProgressModal

A modal that displays the current phase of a transaction with animated progress.

**Location:** `src/components/molecules/transaction-progress-modal.tsx`

**Props:**
```typescript
interface TransactionProgressModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Current transaction progress */
  progress: TransactionProgress;
  /** Title shown in the modal */
  title?: string;
  /** Description shown below title */
  description?: string;
  /** Called when user dismisses error or success */
  onDismiss?: () => void;
  /** Called when user wants to retry after error */
  onRetry?: () => void;
  /** Whether the modal can be dismissed (only in success/error states) */
  dismissible?: boolean;
}
```

### useTransactionProgress

A hook that manages the state for the transaction progress modal.

**Location:** `src/hooks/use-transaction-progress.ts`

**Returns:**
```typescript
interface UseTransactionProgressReturn {
  /** Current transaction progress state */
  progress: TransactionProgress;
  /** Whether the modal should be visible */
  isVisible: boolean;
  /** Start a new transaction (shows modal, sets to preparing) */
  startTransaction: () => void;
  /** Set the current phase */
  setPhase: (phase: TransactionPhase) => void;
  /** Update PoW progress (callback for write operations) */
  updatePoWProgress: (powProgress: PoWProgress) => void;
  /** Mark transaction as successful */
  setSuccess: (txHash?: string) => void;
  /** Mark transaction as failed with error */
  setError: (error: string) => void;
  /** Reset to idle state and hide modal */
  reset: () => void;
  /** Hide modal (for dismissing after success/error) */
  hideModal: () => void;
}
```

### Transaction Phases

```typescript
type TransactionPhase =
  | "idle"        // Initial state
  | "preparing"   // Fetching parameters
  | "computing"   // PoW computation (shows progress bar)
  | "signing"     // Building and signing envelope
  | "submitting"  // Sending to API
  | "confirming"  // Polling for tx confirmation
  | "success"     // Transaction confirmed
  | "error";      // Transaction failed
```

---

## Usage Patterns

### Pattern 1: Manual Control (Full Control)

Use this when you need granular control over phases:

```tsx
import { TransactionProgressModal } from "@/src/components/molecules";
import { useTransactionProgress } from "@/src/hooks";
import { vote } from "@/src/api/write";
import { getTxStatus } from "@/src/api/read/endpoints/tx";

function VoteButton({ postId }) {
  const txProgress = useTransactionProgress();

  const handleVote = async () => {
    const wallet = await walletService.getWallet();
    if (!wallet) return;

    // Start transaction (shows modal)
    txProgress.startTransaction();

    try {
      // Submit vote with PoW progress tracking
      txProgress.setPhase("signing");
      const result = await vote(wallet, postId, 1, txProgress.updatePoWProgress);

      // Poll for confirmation
      txProgress.setPhase("confirming");
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await getTxStatus({ hash: result.tx_hash });
        if (status.found && status.indexed) {
          confirmed = true;
          break;
        }
      }

      if (confirmed) {
        txProgress.setSuccess(result.tx_hash);
      } else {
        txProgress.setSuccess(result.tx_hash); // Still success, just unconfirmed
      }
    } catch (error) {
      txProgress.setError(error.message);
    }
  };

  return (
    <>
      <Button onPress={handleVote}>Vote</Button>
      
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Submitting Vote"
        description="Your vote is being recorded on the blockchain"
        onDismiss={txProgress.hideModal}
        onRetry={handleVote}
      />
    </>
  );
}
```

### Pattern 2: Using executeWithProgress Helper (Recommended)

The `executeWithProgress` helper simplifies the flow:

```tsx
import { TransactionProgressModal } from "@/src/components/molecules";
import { useTransactionProgress, executeWithProgress } from "@/src/hooks";
import { createPost } from "@/src/api/write";
import { getTxStatus } from "@/src/api/read/endpoints/tx";

function CreatePostScreen() {
  const txProgress = useTransactionProgress();

  const handleSubmit = async (title: string, content: string) => {
    const wallet = await walletService.getWallet();
    if (!wallet) return;

    const result = await executeWithProgress(
      txProgress,
      async (onPoWProgress) => {
        txProgress.setPhase("signing");
        const response = await createPost(
          wallet,
          { topic: "general", title, content, tag: "" },
          onPoWProgress
        );
        txProgress.setPhase("submitting");
        return response;
      },
      {
        pollTxStatus: true,
        getTxStatus: async (hash) => {
          const status = await getTxStatus({ hash });
          return {
            found: status.found,
            indexed: status.indexed ?? false,
            success: status.success,
            error_details: status.error_details,
          };
        },
      }
    );

    if (result.success) {
      // Navigate away or show success
      router.back();
    }
  };

  return (
    <>
      {/* Your form UI */}
      
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Creating Post"
        description="Your post is being published to the blockchain"
        onDismiss={txProgress.hideModal}
        onRetry={() => handleSubmit(title, content)}
      />
    </>
  );
}
```

### Pattern 3: Using Mutation Hooks (Simplest)

For operations that already have hooks, use the hook's `onPoWProgress` option:

```tsx
import { TransactionProgressModal } from "@/src/components/molecules";
import { useTransactionProgress } from "@/src/hooks";
import { useSetUsername } from "@/src/api/write";

function UsernameSetup() {
  const txProgress = useTransactionProgress();
  
  const { mutateAsync } = useSetUsername({
    onPoWProgress: txProgress.updatePoWProgress,
  });

  const handleSetUsername = async () => {
    txProgress.startTransaction();

    try {
      const result = await mutateAsync({ username: "myname" });
      txProgress.setSuccess(result.tx_hash);
    } catch (error) {
      txProgress.setError(error.message);
    }
  };

  return (
    <>
      <Button onPress={handleSetUsername}>Set Username</Button>
      
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Setting Username"
        onDismiss={txProgress.hideModal}
        onRetry={handleSetUsername}
      />
    </>
  );
}
```

---

## Caching & Parameters

### What Gets Cached

| Endpoint | Cache Duration | Notes |
|----------|----------------|-------|
| `/get_config` | 5 minutes | Chain config, username limits, tier info |
| `/get_parameters` | **Never** | Must be fresh for every signature |
| `/get_tx_status` | 30 seconds | For one-time checks |

### Why Parameters Must Be Fresh

The `last_block_hash` is included in the signed message to prevent replay attacks. Using a stale block hash will result in:
- `"envelope_timestamp too old"` error
- Invalid signature errors

The `buildSignedEnvelope` function in `src/api/write/signing/envelope.ts` automatically fetches fresh parameters for every write operation.

---

## Error Handling

Common errors and how they appear in the modal:

| Error | Cause | User Message |
|-------|-------|--------------|
| `"invalid signature"` | Canonical bytes mismatch | "Transaction signing failed" |
| `"envelope_timestamp too old"` | Clock drift | "Your device clock may be incorrect" |
| `"insufficient pow"` | Difficulty increased | "Network is busy, please try again" |
| `"username already taken"` | Race condition | "This username was just taken" |
| Network timeout | API unreachable | "Network error, please try again" |

### Handling Specific Errors

```tsx
const handleError = (error: string) => {
  if (error.includes("timestamp")) {
    Alert.alert(
      "Time Sync Issue",
      "Please ensure your device's date and time are correct."
    );
  } else if (error.includes("already taken")) {
    // Navigate back to username selection
    router.back();
  }
  txProgress.hideModal();
};

<TransactionProgressModal
  onDismiss={handleError}
  // ...
/>
```

---

## PoW Progress Details

During the `computing` phase, the modal shows:

1. **Progress bar** - Based on `elapsedMs / estimatedTotalMs`
2. **Attempts count** - Number of Argon2id hashes computed
3. **Elapsed time** - How long the computation has been running
4. **Hint text** - "This may take 10-30 seconds..."

### Estimated Time Calculation

```typescript
// From src/wallet/pow.ts
function estimatePoWTime(difficulty: number): number {
  if (difficulty === 0) return 0;
  
  const expectedAttempts = Math.pow(2, difficulty);
  const hashesPerSecond = 10; // Argon2id is slow on mobile
  
  return expectedAttempts / hashesPerSecond;
}
```

Typical times at various difficulties:
- Difficulty 4: ~1.6 seconds
- Difficulty 8: ~25 seconds
- Difficulty 10: ~100 seconds
- Difficulty 12: ~400 seconds

---

## TX Status Polling

After submitting, poll for confirmation:

```typescript
const status = await getTxStatus({ hash: txHash });

// Response shape:
interface TxStatusResponse {
  found: boolean;      // Transaction exists
  indexed: boolean;    // Indexer processed it
  success?: boolean;   // Transaction succeeded
  tx_type?: string;    // "vote", "post", etc.
  error_details?: string; // If failed
}
```

**Polling Strategy:**
- Poll every 2 seconds
- Stop when `found && indexed`
- Max 30 attempts (60 seconds)
- Consider success even if max attempts reached (tx was submitted)

---

## Complete Example: Following a User

```tsx
import { TransactionProgressModal } from "@/src/components/molecules";
import { useTransactionProgress, executeWithProgress } from "@/src/hooks";
import { followUser } from "@/src/api/write";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { walletService } from "@/src/services/wallet-service";

function FollowButton({ userAddress, username }) {
  const txProgress = useTransactionProgress();
  const [isFollowing, setIsFollowing] = useState(false);

  const handleFollow = async () => {
    const wallet = await walletService.getWallet();
    if (!wallet) return;

    const result = await executeWithProgress(
      txProgress,
      async (onPoWProgress) => {
        txProgress.setPhase("signing");
        const response = await followUser(wallet, userAddress, onPoWProgress);
        txProgress.setPhase("submitting");
        return response;
      },
      {
        pollTxStatus: true,
        getTxStatus: async (hash) => {
          const status = await getTxStatus({ hash });
          return {
            found: status.found,
            indexed: status.indexed ?? false,
            success: status.success,
            error_details: status.error_details,
          };
        },
      }
    );

    if (result.success) {
      setIsFollowing(true);
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["following"] });
    }
  };

  return (
    <>
      <Button 
        onPress={handleFollow}
        disabled={isFollowing || txProgress.isVisible}
      >
        {isFollowing ? "Following" : "Follow"}
      </Button>

      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title={`Following @${username}`}
        description="Recording your follow on the blockchain"
        onDismiss={() => {
          txProgress.hideModal();
        }}
        onRetry={handleFollow}
      />
    </>
  );
}
```

---

## Checklist for New Write Operations

When adding a new write operation:

- [ ] Import `TransactionProgressModal` from molecules
- [ ] Import `useTransactionProgress` (and optionally `executeWithProgress`) from hooks
- [ ] Initialize `const txProgress = useTransactionProgress()`
- [ ] Pass `txProgress.updatePoWProgress` to the write function
- [ ] Handle success and error states
- [ ] Add `<TransactionProgressModal />` to JSX
- [ ] Set appropriate `title` and `description` for the operation
- [ ] Handle `onDismiss` (navigate or update UI)
- [ ] Handle `onRetry` if retry makes sense for this operation
- [ ] Invalidate relevant queries on success


