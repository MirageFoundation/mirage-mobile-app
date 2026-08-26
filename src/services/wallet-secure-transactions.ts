export type SecureWalletStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

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
  const previousMnemonic = await secureStore.get(primaryKey);
  const previousMetadata = metadataStore.get();
  let previousAddress: string | null = null;
  let primaryPromoted = false;

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
        }

        if (previousMetadata) {
          metadataStore.set(previousMetadata);
        } else {
          metadataStore.remove();
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Wallet replacement and rollback both failed",
        );
      }
    }
    throw error;
  } finally {
    const cleanupResults = await Promise.allSettled([
      secureStore.remove(candidateKey),
      secureStore.remove(backupKey),
    ]);
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
    if (backupMnemonic) {
      const backupAddress = deriveAddress(backupMnemonic);
      await secureStore.set(primaryKey, backupMnemonic);
      await verifyMnemonic(
        secureStore,
        primaryKey,
        backupMnemonic,
        backupAddress,
        deriveAddress,
      );
    } else if (primaryMnemonic) {
      await secureStore.remove(primaryKey);
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
    deriveAddress(currentMnemonic);
    if (legacyMnemonic) {
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
