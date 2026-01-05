/**
 * Address derivation for Mirage wallet
 *
 * Derives bech32-encoded addresses (mirage1...) from public keys
 */

// Bech32 encoding from @scure/base (installed via @scure/bip32)
import { bech32 } from "@scure/base";

// Hashing functions
// @ts-expect-error - bundler resolves this correctly at runtime
import { sha256 } from "@noble/hashes/sha2";
// @ts-expect-error - bundler resolves this correctly at runtime
import { ripemd160 } from "@noble/hashes/legacy";

// Local imports
import { derivePrivateKey, getCompressedPublicKey, b64encode, isValidMnemonic } from "./crypto";
import { ADDRESS_PREFIX, type MirageWallet, WalletError, WalletErrorCode } from "./types";

// ============================================
// Address Derivation
// ============================================

/**
 * Derive mirage1... address from compressed public key
 *
 * Algorithm (Cosmos-standard):
 * 1. sha256(compressed_pubkey_33) -> 32 bytes
 * 2. ripemd160(sha256_result) -> 20 bytes
 * 3. bech32.encode('mirage', bech32.toWords(20_bytes)) -> 'mirage1...'
 *
 * @param compressedPubKey - 33-byte compressed secp256k1 public key
 * @returns bech32-encoded address with 'mirage' prefix
 */
export function deriveAddress(compressedPubKey: Uint8Array): string {
  if (compressedPubKey.length !== 33) {
    throw new WalletError(
      `Invalid public key length: expected 33 bytes, got ${compressedPubKey.length}`,
      WalletErrorCode.KEY_DERIVATION_FAILED
    );
  }

  // Step 1: SHA256 hash of the compressed public key
  const sha256Hash = sha256(compressedPubKey);

  // Step 2: RIPEMD160 hash of the SHA256 result
  const ripemd160Hash = ripemd160(sha256Hash);

  // Step 3: Bech32 encode with 'mirage' prefix
  const words = bech32.toWords(ripemd160Hash);
  const address = bech32.encode(ADDRESS_PREFIX as "mirage", words);

  return address;
}

/**
 * Derive address directly from private key
 *
 * @param privateKey - 32-byte secp256k1 private key
 * @returns bech32-encoded address
 */
export function addressFromPrivateKey(privateKey: Uint8Array): string {
  const publicKey = getCompressedPublicKey(privateKey);
  return deriveAddress(publicKey);
}

/**
 * Derive address directly from mnemonic
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @returns bech32-encoded address
 */
export function addressFromMnemonic(mnemonic: string): string {
  const privateKey = derivePrivateKey(mnemonic);
  return addressFromPrivateKey(privateKey);
}

// ============================================
// Full Wallet Creation
// ============================================

/**
 * Create a complete wallet from mnemonic phrase
 *
 * Derives all keys and address from the mnemonic.
 * The mnemonic should be stored securely and NEVER sent to backend.
 *
 * @param mnemonic - BIP39 mnemonic phrase (12 or 24 words)
 * @returns Complete wallet with all derived keys
 * @throws WalletError if mnemonic is invalid
 */
export function createWalletFromMnemonic(mnemonic: string): MirageWallet {
  // Normalize mnemonic (trim whitespace, lowercase)
  const normalizedMnemonic = mnemonic.trim().toLowerCase();

  if (!isValidMnemonic(normalizedMnemonic)) {
    throw new WalletError("Invalid mnemonic phrase", WalletErrorCode.INVALID_MNEMONIC);
  }

  // Derive keys
  const privateKey = derivePrivateKey(normalizedMnemonic);
  const publicKey = getCompressedPublicKey(privateKey);
  const address = deriveAddress(publicKey);

  return {
    mnemonic: normalizedMnemonic,
    privateKey,
    publicKey,
    address,
  };
}

// ============================================
// Address Validation
// ============================================

/**
 * Check if a string is a valid Mirage address
 *
 * @param address - Address string to validate
 * @returns true if valid mirage1... address
 */
export function isValidAddress(address: string): boolean {
  try {
    // Type assertion for bech32 decode which expects specific format
    const decoded = bech32.decode(address as `${string}1${string}`);

    // Check prefix
    if (decoded.prefix !== ADDRESS_PREFIX) {
      return false;
    }

    // Check data length (20 bytes = 32 words in bech32)
    const data = bech32.fromWords(decoded.words);
    if (data.length !== 20) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Decode a Mirage address to get the 20-byte hash
 *
 * @param address - bech32-encoded address
 * @returns 20-byte address hash
 * @throws Error if address is invalid
 */
export function decodeAddress(address: string): Uint8Array {
  // Type assertion for bech32 decode
  const decoded = bech32.decode(address as `${string}1${string}`);

  if (decoded.prefix !== ADDRESS_PREFIX) {
    throw new Error(`Invalid address prefix: expected '${ADDRESS_PREFIX}', got '${decoded.prefix}'`);
  }

  return new Uint8Array(bech32.fromWords(decoded.words));
}

// ============================================
// Utility Functions
// ============================================

/**
 * Truncate address for display (e.g., "mirage1abc...xyz")
 *
 * @param address - Full address
 * @param startChars - Characters to show at start (default 10)
 * @param endChars - Characters to show at end (default 4)
 * @returns Truncated address string
 */
export function truncateAddress(address: string, startChars = 10, endChars = 4): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Get public key as base64 string for API requests
 *
 * @param wallet - Wallet object or public key
 * @returns Base64-encoded public key
 */
export function getPublicKeyBase64(wallet: MirageWallet | Uint8Array): string {
  const publicKey = wallet instanceof Uint8Array ? wallet : wallet.publicKey;
  return b64encode(publicKey);
}
