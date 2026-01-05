# Onboarding API Plan - Wallet Generation & Initialization

> **Implementation Order: 2 of 3** (Read → Onboarding → Write)
>
> Implement after Read API. Uses `useConfig` and `useUserStatus` hooks from Read layer.

---

## Packages to Install

Run this command to install the required packages:

```bash
bun add @tanstack/query-sync-storage-persister @tanstack/react-query-persist-client
```

**That's it!** Only 2 packages needed for TanStack Query persistence.

> Note: Using `sync-storage-persister` because MMKV is synchronous.

### Already Installed (via existing dependencies)

Most crypto packages are already available through `viem` and `@noble/curves`:

| Package | Source | Purpose |
|---------|--------|---------|
| `@scure/bip39` | via `viem` | BIP39 mnemonic generation |
| `@scure/bip32` | via `viem` | HD key derivation (Cosmos path) |
| `@scure/base` | via `@scure/bip32` | **Includes bech32** for `mirage1...` addresses |
| `@noble/curves/secp256k1` | direct dep | ECDSA signing, compressed pubkey |
| `@noble/hashes` | via `@noble/curves` | sha256, ripemd160, **argon2id for PoW** |
| `@tanstack/react-query` | direct dep | Data fetching |
| `expo-secure-store` | direct dep | Secure mnemonic storage |
| `react-native-mmkv` | direct dep | Fast KV storage for cache |
| `buffer` | direct dep | Buffer polyfill |
| `expo-crypto` | direct dep | Native crypto APIs |
| `react-native-get-random-values` | direct dep | crypto.getRandomValues() |
| `axios` | direct dep | HTTP client |

### Import Paths (Important!)

Use these exact import paths in the codebase:

```typescript
// Mnemonic & HD derivation
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';

// Bech32 encoding (NOT a separate package!)
import { bech32 } from '@scure/base';

// Crypto curves & signing
import { secp256k1 } from '@noble/curves/secp256k1';

// Hashing (note the .js suffix for ESM)
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/legacy';
import { argon2id } from '@noble/hashes/argon2';
```

---

## Polyfills Status

### Already Configured (in `/index.ts`)

```typescript
import "react-native-get-random-values";  // crypto.getRandomValues()
import "./polyfills/crypto-subtle";        // crypto.subtle.digest()
import "@/src/utils/buffer";               // global.Buffer
import "fast-text-encoding";               // TextEncoder/TextDecoder
import "react-native-url-polyfill/auto";   // URL/URLSearchParams
```

### Additional Polyfills Needed

None required - the existing polyfills should cover all crypto library needs.

---

## Directory Structure to Create

```
src/
├── api/
│   ├── index.ts                    # API client setup, base URL management
│   ├── client.ts                   # Axios instance with interceptors
│   ├── types.ts                    # Shared API types
│   │
│   ├── read/                       # Read endpoints (GET)
│   │   ├── index.ts
│   │   ├── hooks/                  # TanStack Query hooks
│   │   └── endpoints/              # Endpoint definitions
│   │
│   └── write/                      # Write endpoints (POST)
│       ├── index.ts
│       ├── hooks/                  # Mutation hooks
│       ├── endpoints/              # Endpoint definitions
│       └── signing/                # Canonical bytes & signing
│
├── wallet/
│   ├── index.ts                    # Main wallet exports
│   ├── crypto.ts                   # Key derivation, signing
│   ├── address.ts                  # Address generation
│   ├── canonical.ts                # Canonical byte builders
│   ├── pow.ts                      # Proof of Work computation
│   └── types.ts                    # Wallet types
│
└── services/
    └── wallet-service.ts           # High-level wallet operations
```

---

## Wallet Implementation Plan

### 1. Types (`src/wallet/types.ts`)

```typescript
export interface MirageWallet {
  mnemonic: string;           // 12/24 words - NEVER send to backend
  privateKey: Uint8Array;     // 32 bytes
  publicKey: Uint8Array;      // 33 bytes compressed
  address: string;            // mirage1...
}

export interface WalletMetadata {
  address: string;
  publicKeyBase64: string;    // For API requests
  createdAt: number;
  hasUsername: boolean;
}

export interface SignedEnvelope {
  pubkey: string;             // base64 of 33-byte compressed pubkey
  signature: string;          // base64 of 64-byte compact signature
  timestamp: number;          // milliseconds since epoch
  last_block_hash: string;    // hex string
  pow_difficulty: number;     // 0 for paid tier
  pow: number;                // 0 for paid tier
}
```

### 2. Key Derivation (`src/wallet/crypto.ts`)

**Constants:**
- Curve: secp256k1
- BIP44 coin type: 118 (Cosmos)
- Derivation path: `m/44'/118'/0'/0/0`
- Bech32 prefix: `mirage`

**Functions to implement:**

```typescript
// Generate new 12-word mnemonic
generateMnemonic(): string

// Derive 32-byte private key from mnemonic
derivePrivateKey(mnemonic: string): Uint8Array

// Get 33-byte compressed public key from private key
getCompressedPublicKey(privateKey: Uint8Array): Uint8Array

// Sign data and return 64-byte compact signature (r||s) with low-S
signCanonical(privateKey: Uint8Array, data: Uint8Array): Promise<Uint8Array>
```

### 3. Address Generation (`src/wallet/address.ts`)

**Algorithm:**
1. `sha256(compressed_pubkey_33)` -> 32 bytes
2. `ripemd160(sha256_result)` -> 20 bytes
3. `bech32.encode('mirage', bech32.toWords(20_bytes))` -> `mirage1...`

```typescript
// Derive mirage1... address from compressed public key
deriveAddress(compressedPubKey: Uint8Array): string

// Derive address directly from private key
addressFromPrivateKey(privateKey: Uint8Array): string

// Full wallet creation from mnemonic
createWalletFromMnemonic(mnemonic: string): MirageWallet
```

### 4. Base64 Helpers (`src/wallet/crypto.ts`)

```typescript
// Encode Uint8Array to base64 string
b64encode(data: Uint8Array): string

// Decode base64 string to Uint8Array
b64decode(str: string): Uint8Array

// Hex string to bytes
hexToBytes(hex: string): Uint8Array

// Bytes to hex string
bytesToHex(bytes: Uint8Array): string
```

---

## Secure Storage Plan

### Storage Keys

| Key | Store | Purpose |
|-----|-------|---------|
| `mirage_mnemonic` | expo-secure-store | Encrypted seed phrase |
| `mirage_wallet_meta` | MMKV | Non-sensitive wallet metadata |
| `mirage_user_level` | MMKV | Cached user tier (0-3) |
| `mirage_has_onboarded` | MMKV | Onboarding completion flag |

### Wallet Service (`src/services/wallet-service.ts`)

```typescript
class WalletService {
  // Create new wallet, store mnemonic securely
  async createWallet(): Promise<WalletMetadata>
  
  // Import wallet from existing mnemonic
  async importWallet(mnemonic: string): Promise<WalletMetadata>
  
  // Get wallet for signing (loads mnemonic from secure store)
  async getWallet(): Promise<MirageWallet | null>
  
  // Check if wallet exists
  async hasWallet(): Promise<boolean>
  
  // Get public metadata (no private key)
  async getWalletMetadata(): Promise<WalletMetadata | null>
  
  // Clear wallet (logout)
  async clearWallet(): Promise<void>
  
  // Export mnemonic (for backup display)
  async exportMnemonic(): Promise<string | null>
}
```

### Security Considerations

1. **Mnemonic Storage**: Always use `expo-secure-store` with:
   - `SecureStore.WHEN_UNLOCKED` accessibility
   - Biometric authentication for export

2. **Private Key Handling**:
   - Never persist private key - derive on-demand from mnemonic
   - Clear from memory after signing operations
   - Never log or send to backend

3. **Memory Safety**:
   - Use `Uint8Array` for sensitive data
   - Consider zeroing arrays after use (though JS GC makes this imperfect)

---

## Auth Store Updates (`src/stores/auth-store.ts`)

Update the existing auth store to integrate wallet:

```typescript
interface AuthState {
  // Existing
  isAuthenticated: boolean;
  user: User | null;
  
  // New wallet fields
  walletAddress: string | null;
  publicKeyBase64: string | null;
  userLevel: number;  // 0 = free, 1-3 = paid tiers
  hasUsername: boolean;
  
  // Actions
  initializeWallet: () => Promise<void>;
  createNewWallet: () => Promise<string>;  // returns address
  importWallet: (mnemonic: string) => Promise<string>;
  logout: () => Promise<void>;
  setUserLevel: (level: number) => void;
  setHasUsername: (has: boolean) => void;
}
```

---

## Onboarding Flow

### Screen: Welcome (`app/(auth)/login.tsx`)

1. Show "Create Wallet" and "Import Wallet" options
2. On create:
   - Generate mnemonic
   - Navigate to recovery phrase screen

### Screen: Recovery Phrase (`app/(auth)/recovery-phrase.tsx`)

1. Display 12 words
2. Require confirmation (select words in order or similar)
3. On confirm:
   - Store mnemonic in secure store
   - Store metadata in MMKV
   - Navigate to username screen

### Screen: Username (`app/(auth)/username.tsx`)

1. Input username field
2. Validate using **Read API hooks**:
   - `useConfig()` → get `min_username_size`, `max_username_size`
   - `useAddressFromUsername(username)` → check availability
3. On submit:
   - Call `/api/core/set_username` (write endpoint - implemented later)
   - Poll `useTxStatus(txHash)` for confirmation
   - Update auth store
   - Navigate to home

> Note: Username submission requires Write API. During initial implementation,
> you can skip to home after wallet creation and set username later.

---

## Initialization Flow (App Startup)

Uses Read API hooks implemented in step 1.

```typescript
// In RootProvider or dedicated WalletProvider

async function initializeApp() {
  // 1. Check for existing wallet
  const walletService = new WalletService();
  const hasWallet = await walletService.hasWallet();
  
  if (!hasWallet) {
    // Navigate to onboarding
    return;
  }
  
  // 2. Load wallet metadata
  const metadata = await walletService.getWalletMetadata();
  authStore.setWalletAddress(metadata.address);
  authStore.setPublicKey(metadata.publicKeyBase64);
  
  // 3. Fetch user status from API (uses useUserStatus from Read API)
  const status = await api.read.getUserStatus(metadata.address);
  authStore.setUserLevel(status.user_level);
  authStore.setHasUsername(!!status.username);
  
  // 4. If no username, redirect to username screen
  if (!status.username) {
    // Navigate to username setup
  }
}
```

---

## API Base URL Management

```typescript
// src/api/client.ts

const DEFAULT_NODES = [
  'https://mirage.talk',
  'https://mirage.vote',  // fallback
];

class ApiClient {
  private baseUrl: string;
  private nodeList: string[];
  
  constructor() {
    this.nodeList = DEFAULT_NODES;
    this.baseUrl = this.nodeList[0];
  }
  
  // Switch to next node on failure
  async failover(): Promise<void> {
    const currentIndex = this.nodeList.indexOf(this.baseUrl);
    const nextIndex = (currentIndex + 1) % this.nodeList.length;
    this.baseUrl = this.nodeList[nextIndex];
  }
  
  // Allow runtime URL change
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }
  
  getApiUrl(path: string): string {
    return `${this.baseUrl}/api${path}`;
  }
}
```

---

## Testing Checklist

- [ ] Generate mnemonic produces valid 12 words
- [ ] Derivation path produces correct Cosmos-compatible keys
- [ ] Address derivation matches `mirage1...` format
- [ ] Signature verification passes on backend
- [ ] Mnemonic persists across app restarts
- [ ] Wallet metadata loads correctly
- [ ] Import existing mnemonic works
- [ ] Logout clears all wallet data
- [ ] Failover to backup node works
