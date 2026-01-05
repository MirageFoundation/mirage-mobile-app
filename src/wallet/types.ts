// ============================================
// Wallet Types
// ============================================

/**
 * Complete wallet with all keys derived from mnemonic
 * The mnemonic should NEVER be sent to backend
 */
export interface MirageWallet {
  /** 12/24 word BIP39 mnemonic - NEVER send to backend */
  mnemonic: string;
  /** 32-byte secp256k1 private key */
  privateKey: Uint8Array;
  /** 33-byte compressed public key */
  publicKey: Uint8Array;
  /** bech32 address with 'mirage' prefix (mirage1...) */
  address: string;
}

/**
 * Non-sensitive wallet metadata that can be persisted in MMKV
 */
export interface WalletMetadata {
  /** bech32 address (mirage1...) */
  address: string;
  /** base64 encoded 33-byte compressed public key for API requests */
  publicKeyBase64: string;
  /** Unix timestamp when wallet was created */
  createdAt: number;
  /** Whether user has set a username */
  hasUsername: boolean;
}

/**
 * Envelope for signed API requests
 * Contains all data needed for backend verification
 */
export interface SignedEnvelope {
  /** base64 of 33-byte compressed pubkey */
  pubkey: string;
  /** base64 of 64-byte compact signature (r||s) */
  signature: string;
  /** milliseconds since epoch */
  timestamp: number;
  /** hex string of latest block hash */
  last_block_hash: string;
  /** PoW difficulty (0 for paid tier) */
  pow_difficulty: number;
  /** PoW nonce (0 for paid tier) */
  pow: number;
}

// ============================================
// Crypto Constants
// ============================================

/** BIP44 coin type for Cosmos ecosystem */
export const COSMOS_COIN_TYPE = 118;

/** BIP44 derivation path for Mirage (Cosmos-compatible) */
export const DERIVATION_PATH = "m/44'/118'/0'/0/0";

/** Bech32 prefix for Mirage addresses */
export const ADDRESS_PREFIX = "mirage";

// ============================================
// Storage Keys
// ============================================

export const STORAGE_KEYS = {
  /** Encrypted mnemonic in expo-secure-store */
  MNEMONIC: "mirage_mnemonic",
  /** Non-sensitive wallet metadata in MMKV */
  WALLET_META: "mirage_wallet_meta",
  /** Cached user tier level in MMKV */
  USER_LEVEL: "mirage_user_level",
  /** Onboarding completion flag in MMKV */
  HAS_ONBOARDED: "mirage_has_onboarded",
} as const;

// ============================================
// Error Types
// ============================================

export class WalletError extends Error {
  constructor(
    message: string,
    public code: WalletErrorCode
  ) {
    super(message);
    this.name = "WalletError";
  }
}

export enum WalletErrorCode {
  INVALID_MNEMONIC = "INVALID_MNEMONIC",
  KEY_DERIVATION_FAILED = "KEY_DERIVATION_FAILED",
  SIGNING_FAILED = "SIGNING_FAILED",
  SECURE_STORE_ERROR = "SECURE_STORE_ERROR",
  WALLET_NOT_FOUND = "WALLET_NOT_FOUND",
  WALLET_ALREADY_EXISTS = "WALLET_ALREADY_EXISTS",
}
