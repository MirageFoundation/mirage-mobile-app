export type AuthSessionToken = Readonly<{
  generation: number;
  walletAddress: string | null;
}>;

export function normalizeAuthWalletAddress(
  walletAddress: string | null | undefined,
): string | null {
  const normalized = walletAddress?.trim().toLowerCase();
  return normalized || null;
}

export class AuthSessionCoordinator {
  private generation = 0;
  private walletAddress: string | null = null;
  private identityMutationQueue: Promise<void> = Promise.resolve();

  begin(walletAddress?: string | null): AuthSessionToken {
    this.generation += 1;
    this.walletAddress = normalizeAuthWalletAddress(walletAddress);
    return this.current();
  }

  current(): AuthSessionToken {
    return {
      generation: this.generation,
      walletAddress: this.walletAddress,
    };
  }

  isCurrent(token: AuthSessionToken): boolean {
    return (
      token.generation === this.generation &&
      token.walletAddress === this.walletAddress
    );
  }

  matches(token: AuthSessionToken, walletAddress?: string | null): boolean {
    return (
      this.isCurrent(token) &&
      token.walletAddress === normalizeAuthWalletAddress(walletAddress)
    );
  }

  runIfCurrent<T>(token: AuthSessionToken, effect: () => T): T | undefined {
    if (!this.isCurrent(token)) return undefined;
    return effect();
  }

  enqueueIdentityMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.identityMutationQueue.then(mutation, mutation);
    this.identityMutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export const authSessionCoordinator = new AuthSessionCoordinator();

export function isCurrentAuthWallet(walletAddress: string): boolean {
  const token = authSessionCoordinator.current();
  return authSessionCoordinator.matches(token, walletAddress);
}
