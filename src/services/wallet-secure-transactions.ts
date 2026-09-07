export type SecureWalletStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export class WalletRecoveryError extends Error {
  readonly code = "wallet_recovery_required";
  constructor(message = "Wallet recovery is required. Retry on this device; do not reinstall or clear app data.") {
    super(message);
    this.name = "WalletRecoveryError";
  }
}

export type WalletMetadataStore<T> = {
  get: () => T | null;
  set: (metadata: T) => void;
  remove: () => void;
};

type PreparedWallet<T extends { address: string }> = {
  mnemonic: string;
  address: string;
  metadata: T;
};

type ReplacementOptions<T extends { address: string }> = {
  prepare: () => PreparedWallet<T>;
  deriveAddress: (mnemonic: string) => string;
  secureStore: SecureWalletStore;
  metadataStore: WalletMetadataStore<T>;
  primaryKey: string;
  candidateKey: string;
  backupKey: string;
  onCleanupError?: (error: unknown) => void;
};

async function verifyMnemonic(
  store: SecureWalletStore,
  key: string,
  expectedMnemonic: string,
  expectedAddress: string,
  deriveAddress: (mnemonic: string) => string,
): Promise<void> {
  const storedMnemonic = await store.get(key);
  if (
    storedMnemonic !== expectedMnemonic ||
    deriveAddress(storedMnemonic) !== expectedAddress
  ) {
    throw new Error(`Wallet verification failed for ${key}`);
  }
}

export async function replaceWalletTransaction<T extends { address: string }>({
  prepare,
  deriveAddress,
  secureStore,
  metadataStore,
  primaryKey,
  candidateKey,
  backupKey,
  onCleanupError,
}: ReplacementOptions<T>): Promise<PreparedWallet<T>> {
  // Candidate validation and key derivation must finish before storage is read or written.
  const candidate = prepare();
  await recoverWalletReplacement({
    deriveAddress, secureStore, metadataStore, primaryKey, candidateKey, backupKey,
  });
  const previousMnemonic = await secureStore.get(primaryKey);
  const previousMetadata = metadataStore.get();
  let previousAddress: string | null = null;
  let primaryPromoted = false;
  let cleanupSafe = true;

  try {
    if (previousMnemonic) {
      previousAddress = deriveAddress(previousMnemonic);
      if (previousMetadata && previousMetadata.address !== previousAddress) {
        throw new Error("Stored wallet metadata does not match its mnemonic");
      }
    }

    await secureStore.set(candidateKey, candidate.mnemonic);
    await verifyMnemonic(
      secureStore,
      candidateKey,
      candidate.mnemonic,
      candidate.address,
      deriveAddress,
    );

    if (previousMnemonic && previousAddress) {
      await secureStore.set(backupKey, previousMnemonic);
      await verifyMnemonic(
        secureStore,
        backupKey,
        previousMnemonic,
        previousAddress,
        deriveAddress,
      );
    }

    primaryPromoted = true;
    await secureStore.set(primaryKey, candidate.mnemonic);
    await verifyMnemonic(
      secureStore,
      primaryKey,
      candidate.mnemonic,
      candidate.address,
      deriveAddress,
    );
    metadataStore.set(candidate.metadata);
    if (JSON.stringify(metadataStore.get()) !== JSON.stringify(candidate.metadata)) {
      throw new WalletRecoveryError("Wallet metadata commit could not be verified");
    }
    return candidate;
  } catch (error) {
    if (primaryPromoted) {
      try {
        if (previousMnemonic && previousAddress) {
          await secureStore.set(primaryKey, previousMnemonic);
          await verifyMnemonic(
            secureStore,
            primaryKey,
            previousMnemonic,
            previousAddress,
            deriveAddress,
          );
        } else {
          await secureStore.remove(primaryKey);
          if (await secureStore.get(primaryKey)) throw new WalletRecoveryError();
        }

        if (previousMetadata) {
          metadataStore.set(previousMetadata);
        } else {
          metadataStore.remove();
        }
        if (JSON.stringify(metadataStore.get()) !== JSON.stringify(previousMetadata)) {
          throw new WalletRecoveryError("Wallet metadata restoration could not be verified");
        }
      } catch (rollbackError) {
        cleanupSafe = false;
        onCleanupError?.(rollbackError);
        throw new WalletRecoveryError("Wallet replacement and rollback both failed. Recovery material has been retained; retry on this device.");
      }
    }
    throw error;
  } finally {
    const cleanupResults = cleanupSafe ? await Promise.allSettled([
      secureStore.remove(candidateKey),
      secureStore.remove(backupKey),
    ]) : [];
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        onCleanupError?.(result.reason);
      }
    }
  }
}

type RecoveryOptions<T extends { address: string }> = {
  deriveAddress: (mnemonic: string) => string;
  secureStore: SecureWalletStore;
  metadataStore: Pick<WalletMetadataStore<T>, "get">;
  primaryKey: string;
  candidateKey: string;
  backupKey: string;
};

export async function recoverWalletReplacement<T extends { address: string }>({
  deriveAddress,
  secureStore,
  metadataStore,
  primaryKey,
  candidateKey,
  backupKey,
}: RecoveryOptions<T>): Promise<void> {
  const candidateMnemonic = await secureStore.get(candidateKey);
  const backupMnemonic = await secureStore.get(backupKey);
  if (!candidateMnemonic && !backupMnemonic) return;

  const primaryMnemonic = await secureStore.get(primaryKey);
  const metadata = metadataStore.get();
  const primaryIsCommitted = !!primaryMnemonic &&
    !!metadata &&
    deriveAddress(primaryMnemonic) === metadata.address;

  if (!primaryIsCommitted) {
    if (backupMnemonic && metadata && deriveAddress(backupMnemonic) === metadata.address) {
      const backupAddress = deriveAddress(backupMnemonic);
      await secureStore.set(primaryKey, backupMnemonic);
      await verifyMnemonic(
        secureStore,
        primaryKey,
        backupMnemonic,
        backupAddress,
        deriveAddress,
      );
    } else {
      throw new WalletRecoveryError();
    }
  }

  await secureStore.remove(candidateKey);
  await secureStore.remove(backupKey);
}

type MigrationOptions = {
  deriveAddress: (mnemonic: string) => string;
  secureStore: SecureWalletStore;
  legacyKey: string;
  primaryKey: string;
  setMigrated: () => void;
};

export async function migrateWalletAccessibility({
  deriveAddress,
  secureStore,
  legacyKey,
  primaryKey,
  setMigrated,
}: MigrationOptions): Promise<string | null> {
  const currentMnemonic = await secureStore.get(primaryKey);
  const legacyMnemonic = await secureStore.get(legacyKey);

  if (currentMnemonic) {
    const address = deriveAddress(currentMnemonic);
    if (legacyMnemonic) {
      if (deriveAddress(legacyMnemonic) !== address) throw new WalletRecoveryError();
      await secureStore.remove(legacyKey);
    }
    setMigrated();
    return currentMnemonic;
  }

  if (!legacyMnemonic) {
    setMigrated();
    return null;
  }

  const address = deriveAddress(legacyMnemonic);
  await secureStore.set(primaryKey, legacyMnemonic);
  await verifyMnemonic(
    secureStore,
    primaryKey,
    legacyMnemonic,
    address,
    deriveAddress,
  );
  await secureStore.remove(legacyKey);
  setMigrated();
  return legacyMnemonic;
}
