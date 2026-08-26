/**
 * Token & Subscription Mutation Hooks
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useAuthStore } from "@/src/stores";
import { isCurrentAuthWallet } from "@/src/services/auth-session-coordinator";
import {
  sendTokens,
  upgradeLevel,
  setAutoRenewal,
  type SendTokensInput,
  type SubscriptionLevel,
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
  const setUserLevel = useAuthStore((s) => s.setUserLevel);

  return useMutation({
    mutationKey: mutationKeys.tokens.upgradeLevel(),
    mutationFn: async (level: SubscriptionLevel) => {
      const wallet = await getWallet();
      return upgradeLevel(wallet, level);
    },
    onSuccess: (data, level) => {
      if (!address || !isCurrentAuthWallet(address)) return;
      // Update local state
      setUserLevel(level, address);

      // Invalidate user status
      queryClient.invalidateQueries({
        queryKey: queryKeys.userStatus(address),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.profile(address),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.parameters(address),
      });
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.userStatus(address),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.profile(address),
      });
    },
  });
}
