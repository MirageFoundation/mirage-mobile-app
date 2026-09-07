/**
 * Token & Subscription Mutation Hooks
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateAccountSnapshot } from "@/src/api/cache/account-status-cache";
import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { isCurrentAuthWallet } from "@/src/services/auth-session-coordinator";
import {
  sendTokens,
  upgradeLevel,
  setAutoRenewal,
  type SendTokensInput,
} from "../endpoints/tokens";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";

// ============================================
// Types
// ============================================

export interface UseSendTokensOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

// ============================================
// Send Tokens Hook
// ============================================

export function useSendTokens(options: UseSendTokensOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.tokens.send(),
    mutationFn: async (input: SendTokensInput) => {
      const wallet = await getWallet();
      return sendTokens(wallet, input, options.onPoWProgress);
    },
    onSuccess: (data, { recipient }) => {
      if (!address || !isCurrentAuthWallet(address)) return;
      // Invalidate sender's status (balance changed)
      queryClient.invalidateQueries({
        queryKey: queryKeys.userStatus(address),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.parameters(address),
      });

      // Invalidate recipient's status if viewing their profile
      queryClient.invalidateQueries({
        queryKey: queryKeys.userStatus(recipient),
      });
    },
  });
}

// ============================================
// Upgrade Level Hook
// ============================================

export function useUpgradeLevel() {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.tokens.upgradeLevel(),
    mutationFn: async (periodCount: number) => {
      const wallet = await getWallet();
      return upgradeLevel(wallet, periodCount);
    },
    onSuccess: () => {
      if (!address || !isCurrentAuthWallet(address)) return;
      void invalidateAccountSnapshot(queryClient, address);
    },
  });
}

// ============================================
// Set Auto Renewal Hook
// ============================================

export function useSetAutoRenewal() {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.tokens.setAutoRenewal(),
    mutationFn: async (autoRenew: boolean) => {
      const wallet = await getWallet();
      return setAutoRenewal(wallet, autoRenew);
    },
    onSuccess: () => {
      if (!address || !isCurrentAuthWallet(address)) return;
      void invalidateAccountSnapshot(queryClient, address);
    },
  });
}
