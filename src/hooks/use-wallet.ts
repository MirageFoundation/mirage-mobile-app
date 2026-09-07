/**
 * useWallet Hook
 *
 * Provides easy access to wallet for mutations.
 * Handles loading wallet from secure store when needed.
 */

import { useCallback, useState } from "react";
import { useAuthStore } from "@/src/stores";
import { walletService } from "@/src/services/wallet-service";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import type { MirageWallet } from "@/src/wallet";

// ============================================
// Types
// ============================================

export interface UseWalletResult {
  /** Wallet address (null if not logged in) */
  address: string | null;
  /** Base64 encoded public key */
  publicKeyBase64: string | null;
  /** User level (0 = free, 1-3 = paid) */
  userLevel: number;
  /** Whether user has set a username */
  hasUsername: boolean;
  /** Whether wallet is currently loading */
  isLoading: boolean;
  /** Get full wallet for signing (loads from secure store) */
  getWallet: () => Promise<MirageWallet>;
  /** Check if wallet exists */
  hasWallet: boolean;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for accessing wallet in components and mutations
 *
 * Usage:
 * ```tsx
 * const { address, getWallet, hasWallet } = useWallet();
 *
 * const handleVote = async () => {
 *   const wallet = await getWallet();
 *   await vote(wallet, { target, direction: 1 });
 * };
 * ```
 */
export function useWallet(): UseWalletResult {
  const [isLoading, setIsLoading] = useState(false);

  const address = useAuthStore((s) => s.walletAddress);
  const publicKeyBase64 = useAuthStore((s) => s.publicKeyBase64);
  const userLevel = useAuthStore((s) => s.userLevel);
  const hasUsername = useAuthStore((s) => s.hasUsername);

  /**
   * Get full wallet for signing
   *
   * This loads the mnemonic from secure store and derives keys.
   * The wallet should only be used for signing and not stored.
   */
  const getWallet = useCallback(async (): Promise<MirageWallet> => {
    const session = authSessionCoordinator.current();
    if (!address || useAuthStore.getState().walletAddress !== address ||
        !authSessionCoordinator.matches(session, address)) {
      throw new Error("No wallet connected");
    }

    setIsLoading(true);
    try {
      const wallet = await walletService.getWallet();
      if (!authSessionCoordinator.matches(session, address) ||
          useAuthStore.getState().walletAddress !== address || wallet?.address !== address) {
        throw new Error("Wallet session changed; retry the action.");
      }
      if (!wallet) {
        throw new Error("Failed to load wallet from secure store");
      }
      return wallet;
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  return {
    address,
    publicKeyBase64,
    userLevel,
    hasUsername,
    isLoading,
    getWallet,
    hasWallet: !!address,
  };
}

/**
 * Hook that requires wallet to be connected
 * Throws if wallet is not connected
 */
export function useRequiredWallet(): Omit<UseWalletResult, "address" | "hasWallet"> & {
  address: string;
  hasWallet: true;
} {
  const result = useWallet();

  if (!result.address) {
    throw new Error("Wallet required but not connected");
  }

  return {
    ...result,
    address: result.address,
    hasWallet: true,
  };
}
