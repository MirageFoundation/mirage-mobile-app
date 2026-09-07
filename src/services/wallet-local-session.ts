import { WalletRecoveryError, type SecureWalletStore } from "./wallet-secure-transactions";

export class WalletCleanupError extends Error {
  readonly code = "wallet_cleanup_incomplete";
  constructor() {
    super("Wallet removed from this session, but device cleanup is incomplete. Retry logout on this device before signing in again; do not reinstall or clear app data.");
    this.name = "WalletCleanupError";
  }
}

export class WalletLocalSession<T> {
  private generation = 0;
  private pending: Promise<T> | null = null;

  invalidate(): void {
    this.generation += 1;
    this.pending = null;
  }

  load(load: () => Promise<T>): Promise<T> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const pending = load().then((value) => {
      if (generation !== this.generation) throw new WalletRecoveryError("Wallet session changed; retry the action.");
      return value;
    });
    this.pending = pending;
    void pending.catch(() => {
      if (this.pending === pending) this.pending = null;
    });
    return pending;
  }
}

export function verifyWalletIdentity(
  wallet: { address: string; publicKeyBase64: string } | null,
  metadata: { address: string; publicKeyBase64: string } | null,
): void {
  if (!wallet && !metadata) return;
  if (!wallet || !metadata || wallet.address !== metadata.address ||
      wallet.publicKeyBase64 !== metadata.publicKeyBase64) {
    throw new WalletRecoveryError("Secure wallet and public metadata do not match or are incomplete. Recovery is required on this device.");
  }
}

export async function clearWalletStorage({
  invalidate,
  markCleanup,
  clearCleanup,
  secureStore,
  keys,
  removeMetadata,
}: {
  invalidate: () => void;
  markCleanup: () => void;
  clearCleanup: () => void;
  secureStore: SecureWalletStore;
  keys: string[];
  removeMetadata: () => void;
}): Promise<void> {
  invalidate();
  try {
    // A durable intent must precede any destructive operation.
    markCleanup();
    const results = await Promise.allSettled(keys.map(async (key) => {
      await secureStore.remove(key);
      if (await secureStore.get(key)) throw new WalletCleanupError();
    }));
    removeMetadata();
    if (results.some((result) => result.status === "rejected")) throw new WalletCleanupError();
    clearCleanup();
  } catch {
    throw new WalletCleanupError();
  } finally {
    invalidate();
  }
}
