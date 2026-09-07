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
} from "../endpoints/social";
import { mutationKeys } from "../mutation-keys";
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
    mutationKey: mutationKeys.block.user(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.commentsRoot(), refetchType: "inactive" });
    },
  });
}

export function useUnblockUser(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.block.unblockUser(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.commentsRoot(), refetchType: "inactive" });
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
    mutationKey: mutationKeys.block.post(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.commentsRoot(), refetchType: "inactive" });
    },
  });
}

export function useUnblockPost(options: UseBlockOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.block.unblockPost(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot() });
      queryClient.invalidateQueries({ queryKey: queryKeys.commentsRoot(), refetchType: "inactive" });
    },
  });
}
