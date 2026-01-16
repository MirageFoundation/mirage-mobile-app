/**
 * Mirage Wallet Module
 *
 * Provides cryptographic primitives for:
 * - Mnemonic generation and validation
 * - Key derivation (BIP39/BIP44)
 * - Address generation (bech32)
 * - Transaction signing
 * - Proof of Work computation
 */

// ============================================
// Types
// ============================================
export type { MirageWallet, WalletMetadata, SignedEnvelope } from "./types";
export { COSMOS_COIN_TYPE, DERIVATION_PATH, ADDRESS_PREFIX, STORAGE_KEYS, WalletError, WalletErrorCode } from "./types";

// ============================================
// Crypto Primitives
// ============================================
export {
  // Mnemonic
  generateMnemonic,
  generateMnemonic24,
  isValidMnemonic,
  // Key derivation
  derivePrivateKey,
  getCompressedPublicKey,
  derivePublicKey,
  // Signing
  signCanonical,
  verifySignature,
  // Encoding helpers
  b64encode,
  b64decode,
  hexToBytes,
  bytesToHex,
  concatBytes,
} from "./crypto";

// ============================================
// Address Functions
// ============================================
export {
  // Address derivation
  deriveAddress,
  addressFromPrivateKey,
  addressFromMnemonic,
  // Full wallet creation
  createWalletFromMnemonic,
  // Validation
  isValidAddress,
  decodeAddress,
  // Utilities
  truncateAddress,
  getPublicKeyBase64,
} from "./address";

// ============================================
// Proof of Work
// ============================================
export type { PoWInput, PoWResult } from "./pow-turbo";
export type { PoWParams } from "./pow";
export { computePoW, cancelPow, estimatePoWTime } from "./pow-turbo";
export { verifyPoW, leadingZeroBits, uvarint } from "./pow";
