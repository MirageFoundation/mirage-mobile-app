/**
 * Wallet Service
 *
 * High-level wallet operations with secure storage.
 * Handles mnemonic encryption, wallet lifecycle, and signing operations.
 */

import * as SecureStore from "expo-secure-store";
import * as Sentry from "@sentry/react-native";
import { storage } from "@/src/stores/mmkv-storage";
import { authSessionCoordinator } from "./auth-session-coordinator";
import { clearWalletStorage, verifyWalletIdentity, WalletCleanupError, WalletLocalSession } from "./wallet-local-session";
import {
  migrateWalletAccessibility,
  recoverWalletReplacement,
  replaceWalletTransaction,
  WalletRecoveryError,
  type SecureWalletStore,
} from "@/src/services/wallet-secure-transactions";
import {
  generateMnemonic,
  isValidMnemonic,
  createWalletFromMnemonic,
  getPublicKeyBase64,
  signCanonical,
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
  // Accessible after first unlock — survives background kills
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// ============================================
// Wallet Service Class
// ============================================

const OLD_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

const CLEANUP_KEY = "wallet_cleanup_pending_v1";
const lifecycleSecureStore: SecureWalletStore = {
  get: (key) => SecureStore.getItemAsync(key, key === STORAGE_KEYS.MNEMONIC ? OLD_SECURE_STORE_OPTIONS : SECURE_STORE_OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, key === STORAGE_KEYS.MNEMONIC ? OLD_SECURE_STORE_OPTIONS : SECURE_STORE_OPTIONS),
};

const secureWalletStore: SecureWalletStore = {
  get: (key) => SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS),
};

class WalletService {
  private cachedMnemonic: string | null = null;
  private cachedWallet: MirageWallet | null = null;
  private localSession = new WalletLocalSession<MirageWallet | null>();
  private cleanupBlocked = false;
  private generation = 0;
  private operations: Promise<unknown> = Promise.resolve();
  private startup: Promise<MirageWallet | null> | null = null;

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  invalidateSession(): void {
    this.generation += 1;
    this.cachedMnemonic = null;
    this.cachedWallet = null;
    this.localSession.invalidate();
  }

  prepareCleanup(): MirageWallet | null {
    const wallet = this.cachedWallet;
    this.cleanupBlocked = true;
    this.invalidateSession();
    try {
      storage.set(CLEANUP_KEY, true);
      if (storage.getBoolean(CLEANUP_KEY) !== true) throw new WalletCleanupError();
    } catch {
      throw new WalletCleanupError();
    }
    const metadata = this.getWalletMetadata();
    return wallet && metadata?.address === wallet.address &&
      metadata.publicKeyBase64 === getPublicKeyBase64(wallet) ? wallet : null;
  }

  async migrateKeychainAccessibility(): Promise<void> {
    await this.initializeLocalWallet();
  }

  async initializeLocalWallet(): Promise<MirageWallet | null> {
    if (!this.startup) {
      this.startup = (async () => {
        if (this.cleanupBlocked || storage.getBoolean(CLEANUP_KEY)) {
          await this.clearWallet();
        }
        return this.localSession.load(() => this.enqueue(() => this.restoreLocalWallet()));
      })().finally(() => { this.startup = null; });
    }
    return this.startup;
  }

  private async restoreLocalWallet(): Promise<MirageWallet | null> {
    if (this.cleanupBlocked || storage.getBoolean(CLEANUP_KEY)) throw new WalletCleanupError();
    const derived = new Map<string, MirageWallet>();
    const derive = (value: string) => {
      let wallet = derived.get(value);
      if (!wallet) {
        wallet = createWalletFromMnemonic(value);
        derived.set(value, wallet);
      }
      return wallet;
    };
    await recoverWalletReplacement({
      deriveAddress: (value) => derive(value).address,
      secureStore: secureWalletStore,
      metadataStore: { get: () => this.getWalletMetadata() },
      primaryKey: STORAGE_KEYS.MNEMONIC_V2,
      candidateKey: STORAGE_KEYS.MNEMONIC_CANDIDATE,
      backupKey: STORAGE_KEYS.MNEMONIC_BACKUP,
    });
    const mnemonic = await migrateWalletAccessibility({
      deriveAddress: (value) => derive(value).address,
      secureStore: lifecycleSecureStore,
      legacyKey: STORAGE_KEYS.MNEMONIC,
      primaryKey: STORAGE_KEYS.MNEMONIC_V2,
      setMigrated: () => storage.set("wallet_keychain_migrated_v2", true),
    });
    const wallet = mnemonic ? derive(mnemonic) : null;
    verifyWalletIdentity(wallet ? { address: wallet.address, publicKeyBase64: getPublicKeyBase64(wallet) } : null, this.getWalletMetadata());
    return wallet;
  }

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
    return this.enqueue(() => this.createWalletExclusive());
  }

  private async createWalletExclusive(): Promise<WalletMetadata> {
    await this.restoreLocalWallet();
    this.invalidateSession();
    const existingMetadata = this.getWalletMetadata();
    if (existingMetadata) {
      throw new WalletError("Wallet already exists. Clear existing wallet first.", WalletErrorCode.WALLET_ALREADY_EXISTS);
    }

    try {
      // Generate new mnemonic
      const mnemonic = generateMnemonic();

      // Create wallet from mnemonic
      const wallet = createWalletFromMnemonic(mnemonic);

      // Create and store metadata - marked as pending
      const metadata: WalletMetadata = {
        address: wallet.address,
        publicKeyBase64: getPublicKeyBase64(wallet),
        createdAt: Date.now(),
        hasUsername: false,
        pending: true, // Wallet is pending until user confirms recovery phrase
        signup: { phase: "wallet_generated", operationId: `${wallet.address}:${Date.now()}` },
      };

      await this.persistWallet(wallet, metadata);
      console.log("[WalletService] Created pending wallet:", wallet.address);

      // Cache mnemonic for session
      this.cachedMnemonic = mnemonic;
      this.cachedWallet = wallet;

      return metadata;
    } catch (error) {
      if (error instanceof WalletError || error instanceof WalletRecoveryError || error instanceof WalletCleanupError) throw error;
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
  confirmWallet(expectedAddress: string): void {
    const metadata = this.getWalletMetadata();
    if (!metadata?.pending || metadata.address !== expectedAddress ||
        !metadata.hasUsername || metadata.signup?.phase !== "confirmed" ||
        !metadata.signup.username || !metadata.signup.operationId ||
        this.cachedWallet?.address !== expectedAddress) {
      throw new Error("Username registration must be verified before confirming this wallet");
    }
    this.storeMetadata({ ...metadata, pending: false });
    if (this.getWalletMetadata()?.pending !== false) throw new WalletRecoveryError();
  }
  
  /**
   * Check if there's a pending (incomplete) wallet.
   */
  hasPendingWallet(): boolean {
    const metadata = this.getWalletMetadata();
    return metadata?.pending === true;
  }
  
  /**
   * Legacy callers must never silently discard an interrupted signup key.
   */
  async cleanupPendingWallet(): Promise<boolean> {
    return false;
  }

  /**
   * Import wallet from existing mnemonic
   *
   * @param mnemonic - English BIP39 mnemonic (12, 15, 18, 21 or 24 words)
   * @returns Wallet metadata
   * @throws WalletError if mnemonic is invalid or replacement fails
   */
  async importWallet(mnemonic: string): Promise<WalletMetadata> {
    return this.enqueue(() => this.importWalletExclusive(mnemonic));
  }

  private async importWalletExclusive(mnemonic: string): Promise<WalletMetadata> {
    // Validate mnemonic first
    const normalizedMnemonic = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");

    if (!isValidMnemonic(normalizedMnemonic)) {
      throw new WalletError("Invalid mnemonic phrase", WalletErrorCode.INVALID_MNEMONIC);
    }

    await this.restoreLocalWallet();
    this.invalidateSession();

    try {
      const wallet = createWalletFromMnemonic(normalizedMnemonic);
      const metadata: WalletMetadata = {
        address: wallet.address,
        publicKeyBase64: getPublicKeyBase64(wallet),
        createdAt: Date.now(),
        hasUsername: false,
      };

      await this.persistWallet(wallet, metadata);

      this.cachedMnemonic = normalizedMnemonic;
      this.cachedWallet = wallet;

      return metadata;
    } catch (error) {
      if (error instanceof WalletError || error instanceof WalletRecoveryError || error instanceof WalletCleanupError) throw error;
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
    const session = authSessionCoordinator.current();
    const generation = this.generation;
    if (this.cleanupBlocked || storage.getBoolean(CLEANUP_KEY)) throw new WalletCleanupError();
    const wallet = await (this.cachedWallet ?? this.initializeLocalWallet());
    if (generation !== this.generation || !authSessionCoordinator.isCurrent(session) || this.cleanupBlocked || storage.getBoolean(CLEANUP_KEY)) {
      throw new WalletRecoveryError("Wallet session changed; retry the action.");
    }
    verifyWalletIdentity(wallet ? { address: wallet.address, publicKeyBase64: getPublicKeyBase64(wallet) } : null, this.getWalletMetadata());
    if (wallet && session.walletAddress && session.walletAddress !== wallet.address) throw new WalletRecoveryError();
    this.cachedWallet = wallet;
    this.cachedMnemonic = wallet?.mnemonic ?? null;
    return wallet;
  }

  /**
   * Check if a wallet exists in storage
   */
  async hasWallet(): Promise<boolean> {
    return !!(await this.getWallet());
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
    const session = authSessionCoordinator.current();
    const wallet = await this.getWallet();
    if (!authSessionCoordinator.isCurrent(session) || this.cleanupBlocked) throw new WalletRecoveryError("Wallet session changed; retry the action.");
    if (!wallet) {
      throw new WalletError("No wallet found", WalletErrorCode.WALLET_NOT_FOUND);
    }

    try {
      const signature = signCanonical(wallet.privateKey, data);
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
    const session = authSessionCoordinator.current();
    const wallet = await this.getWallet();
    if (!authSessionCoordinator.isCurrent(session) || this.cleanupBlocked) throw new WalletRecoveryError("Wallet session changed; retry the action.");
    if (!wallet) {
      throw new WalletError("No wallet found", WalletErrorCode.WALLET_NOT_FOUND);
    }

    const timestamp = Date.now();
    const envelopeNonce = (BigInt(timestamp) * 1000000n + BigInt(Math.floor(Math.random() * 0x100000000)))
      .toString();
    const { privateKey, publicKey } = wallet;

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
    this.prepareCleanup();
    return this.enqueue(() => this.clearWalletExclusive());
  }

  private async clearWalletExclusive(): Promise<void> {
    this.cleanupBlocked = true;
    await clearWalletStorage({
      invalidate: () => this.invalidateSession(),
      markCleanup: () => {
        this.prepareCleanup();
      },
      clearCleanup: () => {
        storage.remove(CLEANUP_KEY);
        if (storage.getBoolean(CLEANUP_KEY)) throw new WalletCleanupError();
      },
      secureStore: lifecycleSecureStore,
      keys: [STORAGE_KEYS.MNEMONIC_V2, STORAGE_KEYS.MNEMONIC_CANDIDATE, STORAGE_KEYS.MNEMONIC_BACKUP, STORAGE_KEYS.MNEMONIC],
      removeMetadata: () => {
        for (const key of [STORAGE_KEYS.WALLET_META, STORAGE_KEYS.USER_LEVEL, STORAGE_KEYS.HAS_ONBOARDED]) {
          storage.remove(key);
          if (storage.contains(key)) throw new WalletCleanupError();
        }
      },
    });
    this.cleanupBlocked = false;
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
    const session = authSessionCoordinator.current();
    const wallet = await this.getWallet();
    if (!authSessionCoordinator.isCurrent(session) || this.cleanupBlocked) throw new WalletRecoveryError("Wallet session changed; retry the action.");
    return wallet?.mnemonic ?? null;
  }

  private async persistWallet(wallet: MirageWallet, metadata: WalletMetadata): Promise<void> {
    await replaceWalletTransaction({
      prepare: () => ({ mnemonic: wallet.mnemonic, address: wallet.address, metadata }),
      deriveAddress: (value) => createWalletFromMnemonic(value).address,
      secureStore: secureWalletStore,
      metadataStore: {
        get: () => this.getWalletMetadata(),
        set: (value) => this.storeMetadata(value),
        remove: () => storage.remove(STORAGE_KEYS.WALLET_META),
      },
      primaryKey: STORAGE_KEYS.MNEMONIC_V2,
      candidateKey: STORAGE_KEYS.MNEMONIC_CANDIDATE,
      backupKey: STORAGE_KEYS.MNEMONIC_BACKUP,
      onCleanupError: (error) => {
        Sentry.captureException(error, { tags: { action: "wallet_persistence_cleanup" } });
      },
    });
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
