/**
 * Wallet Service
 *
 * High-level wallet operations with secure storage.
 * Handles mnemonic encryption, wallet lifecycle, and signing operations.
 */

import * as SecureStore from "expo-secure-store";
import * as Sentry from "@sentry/react-native";
import { storage } from "@/src/stores/mmkv-storage";
import {
  generateMnemonic,
  isValidMnemonic,
  createWalletFromMnemonic,
  getPublicKeyBase64,
  signCanonical,
  derivePrivateKey,
  getCompressedPublicKey,
  b64encode,
  hexToBytes,
  type MirageWallet,
  type WalletMetadata,
  type SignedEnvelope,
  STORAGE_KEYS,
  WalletError,
  WalletErrorCode,
} from "@/src/wallet";

// ============================================
// Secure Store Options
// ============================================

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  // Only accessible when device is unlocked
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

// ============================================
// Wallet Service Class
// ============================================

class WalletService {
  private cachedMnemonic: string | null = null;
  private cachedWallet: MirageWallet | null = null;

  // ============================================
  // Wallet Creation & Import
  // ============================================

  /**
   * Create a new wallet with a fresh mnemonic
   *
   * Generates a new 12-word mnemonic, derives all keys,
   * stores mnemonic in secure store, and metadata in MMKV.
   * The wallet is marked as "pending" until confirmWallet() is called.
   *
   * @returns Wallet metadata (address, public key, etc.)
   * @throws WalletError if wallet already exists or storage fails
   */
  async createWallet(): Promise<WalletMetadata> {
    // Check if wallet already exists (but allow overwriting pending wallets)
    const existingMetadata = this.getWalletMetadata();
    if (existingMetadata && !existingMetadata.pending) {
      throw new WalletError("Wallet already exists. Clear existing wallet first.", WalletErrorCode.WALLET_ALREADY_EXISTS);
    }

    // If there's a pending wallet, clear it first
    if (existingMetadata?.pending) {
      console.log("[WalletService] Clearing pending wallet before creating new one");
      await this.clearWallet();
    }

    try {
      // Generate new mnemonic
      const mnemonic = generateMnemonic();

      // Create wallet from mnemonic
      const wallet = createWalletFromMnemonic(mnemonic);

      // Store mnemonic securely
      await this.storeMnemonic(mnemonic);

      // Create and store metadata - marked as pending
      const metadata: WalletMetadata = {
        address: wallet.address,
        publicKeyBase64: getPublicKeyBase64(wallet),
        createdAt: Date.now(),
        hasUsername: false,
        pending: true, // Wallet is pending until user confirms recovery phrase
      };

      this.storeMetadata(metadata);
      console.log("[WalletService] Created pending wallet:", wallet.address);

      // Cache mnemonic for session
      this.cachedMnemonic = mnemonic;

      return metadata;
    } catch (error) {
      if (error instanceof WalletError) throw error;
      Sentry.captureException(error, {
        tags: { action: "wallet_create" },
      });
      throw new WalletError(`Failed to create wallet: ${error}`, WalletErrorCode.SECURE_STORE_ERROR);
    }
  }
  
  /**
   * Confirm wallet creation after user has backed up recovery phrase
   * This removes the "pending" flag from the wallet metadata.
   */
  confirmWallet(): void {
    const metadata = this.getWalletMetadata();
    if (metadata) {
      this.storeMetadata({ ...metadata, pending: false });
      console.log("[WalletService] Wallet confirmed:", metadata.address);
    }
  }
  
  /**
   * Check if there's a pending (incomplete) wallet
   * Used to clean up on app startup
   */
  hasPendingWallet(): boolean {
    const metadata = this.getWalletMetadata();
    return metadata?.pending === true;
  }
  
  /**
   * Clean up pending wallets on app startup
   * Returns true if a pending wallet was cleaned up
   */
  async cleanupPendingWallet(): Promise<boolean> {
    if (this.hasPendingWallet()) {
      console.log("[WalletService] Cleaning up pending wallet from incomplete signup");
      await this.clearWallet();
      return true;
    }
    return false;
  }

  /**
   * Import wallet from existing mnemonic
   *
   * @param mnemonic - 12 or 24 word BIP39 mnemonic
   * @returns Wallet metadata
   * @throws WalletError if mnemonic is invalid or wallet exists
   */
  async importWallet(mnemonic: string): Promise<WalletMetadata> {
    // Validate mnemonic first
    const normalizedMnemonic = mnemonic.trim().toLowerCase();

    if (!isValidMnemonic(normalizedMnemonic)) {
      throw new WalletError("Invalid mnemonic phrase", WalletErrorCode.INVALID_MNEMONIC);
    }

    // Check if wallet already exists
    if (await this.hasWallet()) {
      throw new WalletError("Wallet already exists. Clear existing wallet first.", WalletErrorCode.WALLET_ALREADY_EXISTS);
    }

    try {
      // Create wallet from mnemonic
      const wallet = createWalletFromMnemonic(normalizedMnemonic);

      // Store mnemonic securely
      await this.storeMnemonic(normalizedMnemonic);

      // Create and store metadata
      const metadata: WalletMetadata = {
        address: wallet.address,
        publicKeyBase64: getPublicKeyBase64(wallet),
        createdAt: Date.now(),
        hasUsername: false,
      };

      this.storeMetadata(metadata);

      // Cache mnemonic for session
      this.cachedMnemonic = normalizedMnemonic;

      return metadata;
    } catch (error) {
      if (error instanceof WalletError) throw error;
      Sentry.captureException(error, {
        tags: { action: "wallet_import" },
      });
      throw new WalletError(`Failed to import wallet: ${error}`, WalletErrorCode.SECURE_STORE_ERROR);
    }
  }

  // ============================================
  // Wallet Access
  // ============================================

  /**
   * Get full wallet with private key for signing
   *
   * Loads mnemonic from secure store and derives keys.
   * Private key should be used immediately and not stored.
   *
   * @returns Full wallet or null if no wallet exists
   */
  async getWallet(): Promise<MirageWallet | null> {
    try {
      const mnemonic = await this.getMnemonic();
      if (!mnemonic) return null;

      if (this.cachedWallet && this.cachedWallet.mnemonic === mnemonic) {
        return this.cachedWallet;
      }

      const wallet = createWalletFromMnemonic(mnemonic);
      this.cachedWallet = wallet;
      return wallet;
    } catch {
      return null;
    }
  }

  /**
   * Check if a wallet exists in storage
   */
  async hasWallet(): Promise<boolean> {
    try {
      const mnemonic = await SecureStore.getItemAsync(STORAGE_KEYS.MNEMONIC, SECURE_STORE_OPTIONS);
      return !!mnemonic;
    } catch {
      return false;
    }
  }

  /**
   * Get public wallet metadata (no private key)
   */
  getWalletMetadata(): WalletMetadata | null {
    try {
      const metadataJson = storage.getString(STORAGE_KEYS.WALLET_META);
      if (!metadataJson) return null;
      return JSON.parse(metadataJson) as WalletMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Update wallet metadata
   */
  updateMetadata(updates: Partial<WalletMetadata>): void {
    const current = this.getWalletMetadata();
    if (!current) return;

    const updated = { ...current, ...updates };
    this.storeMetadata(updated);
  }

  // ============================================
  // Signing Operations
  // ============================================

  /**
   * Sign data with the wallet's private key
   *
   * @param data - Data to sign (Uint8Array)
   * @returns Base64-encoded signature
   * @throws WalletError if no wallet or signing fails
   */
  async signData(data: Uint8Array): Promise<string> {
    const mnemonic = await this.getMnemonic();
    if (!mnemonic) {
      throw new WalletError("No wallet found", WalletErrorCode.WALLET_NOT_FOUND);
    }

    try {
      const privateKey = derivePrivateKey(mnemonic);
      const signature = signCanonical(privateKey, data);
      return b64encode(signature);
    } catch (error) {
      if (error instanceof WalletError) throw error;
      Sentry.captureException(error, {
        tags: { action: "wallet_sign" },
      });
      throw new WalletError(`Signing failed: ${error}`, WalletErrorCode.SIGNING_FAILED);
    }
  }

  /**
   * Create a signed envelope for API requests
   *
   * @param messageHash - SHA256 hash of the canonical message bytes
   * @param lastBlockHash - Latest block hash from /get_parameters
   * @param powDifficulty - PoW difficulty (0 for paid users)
   * @param powNonce - PoW nonce (0 for paid users)
   * @returns Signed envelope ready for API submission
   */
  async createSignedEnvelope(
    messageHash: Uint8Array,
    lastBlockHash: string,
    powDifficulty = 0,
    powNonce = 0
  ): Promise<SignedEnvelope> {
    const mnemonic = await this.getMnemonic();
    if (!mnemonic) {
      throw new WalletError("No wallet found", WalletErrorCode.WALLET_NOT_FOUND);
    }

    const timestamp = Date.now();
    const envelopeNonce = (BigInt(timestamp) * 1000000n + BigInt(Math.floor(Math.random() * 0x100000000)))
      .toString();
    const privateKey = derivePrivateKey(mnemonic);
    const publicKey = getCompressedPublicKey(privateKey);

    // Build signing payload: messageHash + timestamp + blockHash + pow
    const timestampBytes = new Uint8Array(8);
    new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), false);

    const blockHashBytes = hexToBytes(lastBlockHash);
    const powDiffBytes = new Uint8Array(4);
    new DataView(powDiffBytes.buffer).setUint32(0, powDifficulty, false);

    const powBytes = new Uint8Array(4);
    new DataView(powBytes.buffer).setUint32(0, powNonce, false);

    // Concatenate all components for signing
    const totalLength = messageHash.length + 8 + blockHashBytes.length + 4 + 4;
    const signingPayload = new Uint8Array(totalLength);
    let offset = 0;
    signingPayload.set(messageHash, offset);
    offset += messageHash.length;
    signingPayload.set(timestampBytes, offset);
    offset += 8;
    signingPayload.set(blockHashBytes, offset);
    offset += blockHashBytes.length;
    signingPayload.set(powDiffBytes, offset);
    offset += 4;
    signingPayload.set(powBytes, offset);

    // Sign the payload
    const signature = signCanonical(privateKey, signingPayload);

    return {
      pubkey: b64encode(publicKey),
      signature: b64encode(signature),
      timestamp,
      last_block_hash: lastBlockHash,
      pow_difficulty: powDifficulty,
      pow: powNonce,
      envelope_nonce: envelopeNonce,
    };
  }

  // ============================================
  // Wallet Lifecycle
  // ============================================

  /**
   * Clear all wallet data (logout)
   *
   * Removes mnemonic from secure store and metadata from MMKV.
   */
  async clearWallet(): Promise<void> {
    try {
      // Clear secure store
      await SecureStore.deleteItemAsync(STORAGE_KEYS.MNEMONIC, SECURE_STORE_OPTIONS);

      // Clear MMKV data
      storage.remove(STORAGE_KEYS.WALLET_META);
      storage.remove(STORAGE_KEYS.USER_LEVEL);
      storage.remove(STORAGE_KEYS.HAS_ONBOARDED);

      // Clear cached mnemonic
      this.cachedMnemonic = null;
      this.cachedWallet = null;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { action: "wallet_clear" },
      });
      throw new WalletError(`Failed to clear wallet: ${error}`, WalletErrorCode.SECURE_STORE_ERROR);
    }
  }

  /**
   * Export mnemonic for backup display
   *
   * Returns the mnemonic phrase for user backup.
   * Should only be called with appropriate security measures (biometric, etc.)
   *
   * @returns Mnemonic phrase or null if not found
   */
  async exportMnemonic(): Promise<string | null> {
    return this.getMnemonic();
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Get mnemonic from cache or secure store
   */
  private async getMnemonic(): Promise<string | null> {
    // Return cached mnemonic if available
    if (this.cachedMnemonic) {
      return this.cachedMnemonic;
    }

    try {
      const mnemonic = await SecureStore.getItemAsync(STORAGE_KEYS.MNEMONIC, SECURE_STORE_OPTIONS);

      if (mnemonic) {
        // Cache for future use
        this.cachedMnemonic = mnemonic;
      }

      return mnemonic;
    } catch (error) {
      console.error("[WalletService] Failed to get mnemonic:", error);
      Sentry.captureException(error, {
        tags: { action: "wallet_get_mnemonic" },
      });
      return null;
    }
  }

  /**
   * Store mnemonic in secure store
   */
  private async storeMnemonic(mnemonic: string): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.MNEMONIC, mnemonic, SECURE_STORE_OPTIONS);
  }

  /**
   * Store metadata in MMKV
   */
  private storeMetadata(metadata: WalletMetadata): void {
    storage.set(STORAGE_KEYS.WALLET_META, JSON.stringify(metadata));
  }
}

// ============================================
// Singleton Export
// ============================================

export const walletService = new WalletService();
