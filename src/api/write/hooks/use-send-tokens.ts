/**
 * Token & Subscription Mutation Hooks
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { mutationKeys } from "@/src/api/write/mutation-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useAuthStore } from "@/src/stores";
import {
  sendTokens,
  upgradeLevel,
  setAutoRenewal,
  type SendTokensInput,
  type SubscriptionLevel,
} from "../endpoints/tokens";
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
    mutationKey: mutationKeys.sendTokens(),
    mutationFn: async (input: SendTokensInput) => {
      const wallet = await getWallet();
      return sendTokens(wallet, input, options.onPoWProgress);
    },
    onSuccess: (data, { recipient }) => {
      // Invalidate sender's status (balance changed)
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.parameters(address),
        });
      }

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
  const setUserLevel = useAuthStore((s) => s.setUserLevel);

  return useMutation({
    mutationKey: mutationKeys.upgradeLevel(),
    mutationFn: async (level: SubscriptionLevel) => {
      const wallet = await getWallet();
      return upgradeLevel(wallet, level);
    },
    onSuccess: (data, level) => {
      // Update local state
      setUserLevel(level);

      // Invalidate user status
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.parameters(address),
        });
      }
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
    mutationKey: mutationKeys.setAutoRenewal(),
    mutationFn: async (autoRenew: boolean) => {
      const wallet = await getWallet();
      return setAutoRenewal(wallet, autoRenew);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
    },
  });
}
