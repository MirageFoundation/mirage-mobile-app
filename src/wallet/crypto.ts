/**
 * Crypto utilities for Mirage wallet
 *
 * Key derivation, signing, and encoding helpers
 */

// Mnemonic & HD derivation
import { generateMnemonic as generateBip39Mnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";

// Crypto curves & signing
// @ts-expect-error - bundler resolves this correctly at runtime
import { secp256k1 } from "@noble/curves/secp256k1";

// Types
import { DERIVATION_PATH, WalletError, WalletErrorCode } from "./types";

// ============================================
// Mnemonic Generation
// ============================================

/**
 * Generate a new 12-word BIP39 mnemonic
 * Uses crypto.getRandomValues() for entropy (polyfilled in index.ts)
 */
export function generateMnemonic(): string {
  // 128 bits of entropy = 12 words
  return generateBip39Mnemonic(wordlist, 128);
}

/**
 * Generate a 24-word BIP39 mnemonic for extra security
 */
export function generateMnemonic24(): string {
  // 256 bits of entropy = 24 words
  return generateBip39Mnemonic(wordlist, 256);
}

/**
 * Validate a BIP39 mnemonic phrase
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

// ============================================
// Key Derivation
// ============================================

/**
 * Derive 32-byte private key from mnemonic using BIP44 path
 * Path: m/44'/118'/0'/0/0 (Cosmos-compatible)
 *
 * @throws WalletError if mnemonic is invalid or derivation fails
 */
export function derivePrivateKey(mnemonic: string): Uint8Array {
  if (!isValidMnemonic(mnemonic)) {
    throw new WalletError("Invalid mnemonic phrase", WalletErrorCode.INVALID_MNEMONIC);
  }

  try {
    // Convert mnemonic to seed (512-bit)
    const seed = mnemonicToSeedSync(mnemonic);

    // Create HD key from seed
    const hdKey = HDKey.fromMasterSeed(seed);

    // Derive child key at Cosmos path
    const derivedKey = hdKey.derive(DERIVATION_PATH);

    if (!derivedKey.privateKey) {
      throw new WalletError("Failed to derive private key", WalletErrorCode.KEY_DERIVATION_FAILED);
    }

    return derivedKey.privateKey;
  } catch (error) {
    if (error instanceof WalletError) throw error;
    throw new WalletError(`Key derivation failed: ${error}`, WalletErrorCode.KEY_DERIVATION_FAILED);
  }
}

/**
 * Get 33-byte compressed public key from private key
 */
export function getCompressedPublicKey(privateKey: Uint8Array): Uint8Array {
  // secp256k1.getPublicKey returns compressed (33 bytes) by default
  return secp256k1.getPublicKey(privateKey, true);
}

/**
 * Derive public key directly from mnemonic
 * Convenience function that combines derivation steps
 */
export function derivePublicKey(mnemonic: string): Uint8Array {
  const privateKey = derivePrivateKey(mnemonic);
  return getCompressedPublicKey(privateKey);
}

// ============================================
// Signing
// ============================================

/**
 * Sign data and return 64-byte compact signature (r||s) with low-S normalization
 *
 * The signature is canonical (low-S) as required by most blockchain implementations.
 * Returns raw 64-byte signature without recovery byte.
 *
 * @param privateKey - 32-byte secp256k1 private key
 * @param data - Data to sign (will be hashed internally by secp256k1)
 * @returns 64-byte compact signature (32 bytes r + 32 bytes s)
 */
export function signCanonical(privateKey: Uint8Array, data: Uint8Array): Uint8Array {
  try {
    // Sign with lowS: true for canonical signature
    const signature = secp256k1.sign(data, privateKey, { lowS: true });

    // Return compact format (64 bytes: r || s)
    return signature.toCompactRawBytes();
  } catch (error) {
    throw new WalletError(`Signing failed: ${error}`, WalletErrorCode.SIGNING_FAILED);
  }
}

/**
 * Verify a signature against data and public key
 *
 * @param signature - 64-byte compact signature
 * @param data - Original data that was signed
 * @param publicKey - 33-byte compressed public key
 * @returns true if signature is valid
 */
export function verifySignature(signature: Uint8Array, data: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return secp256k1.verify(signature, data, publicKey);
  } catch {
    return false;
  }
}

// ============================================
// Encoding Helpers
// ============================================

/**
 * Encode Uint8Array to base64 string
 */
export function b64encode(data: Uint8Array): string {
  // Use Buffer which is polyfilled globally
  return Buffer.from(data).toString("base64");
}

/**
 * Decode base64 string to Uint8Array
 */
export function b64decode(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (cleanHex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string (lowercase)
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Concatenate multiple Uint8Arrays into one
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
