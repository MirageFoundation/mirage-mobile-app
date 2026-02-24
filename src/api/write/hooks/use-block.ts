/**
 * Block/Unblock Mutation Hooks
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import {
  blockUser,
  unblockUser,
  blockPost,
  unblockPost,
  blockTopic,
  unblockTopic,
} from "../endpoints/social";
import type { PoWProgress } from "../signing";

// ============================================
// Types
// ============================================

export interface UseBlockOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

// ============================================
// User Block Hooks
// ============================================

export function useBlockUser(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (userAddress: string) => {
      const wallet = await getWallet();
      return blockUser(wallet, userAddress, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userBlocked(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      // Blocking affects what content is shown
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}

// ============================================
// Topic Block Hooks
// ============================================

export function useBlockTopic(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (topic: string) => {
      const wallet = await getWallet();
      return blockTopic(wallet, topic, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userBlocked(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useUnblockTopic(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (topic: string) => {
      const wallet = await getWallet();
      return unblockTopic(wallet, topic, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userBlocked(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useUnblockUser(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (userAddress: string) => {
      const wallet = await getWallet();
      return unblockUser(wallet, userAddress, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userBlocked(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}

// ============================================
// Post Block Hooks
// ============================================

export function useBlockPost(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (postId: string) => {
      const wallet = await getWallet();
      return blockPost(wallet, postId, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userBlocked(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      // Blocked post should be hidden
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}

export function useUnblockPost(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (postId: string) => {
      const wallet = await getWallet();
      return unblockPost(wallet, postId, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userBlocked(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}
