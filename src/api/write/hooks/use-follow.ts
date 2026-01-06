/**
 * Follow/Unfollow Mutation Hooks
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import {
  followUser,
  unfollowUser,
  followTopic,
  unfollowTopic,
  followModerator,
  unfollowModerator,
} from "../endpoints/social";
import type { PoWProgress } from "../signing";

// ============================================
// Types
// ============================================

export interface UseFollowOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

// ============================================
// User Follow Hooks
// ============================================

export function useFollowUser(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (userAddress: string) => {
      const wallet = await getWallet();
      return followUser(wallet, userAddress, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      // Following affects the feed
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useUnfollowUser(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (userAddress: string) => {
      const wallet = await getWallet();
      return unfollowUser(wallet, userAddress, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

// ============================================
// Topic Follow Hooks
// ============================================

export function useFollowTopic(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (topic: string) => {
      const wallet = await getWallet();
      return followTopic(wallet, topic, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      // Topic following affects the feed
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useUnfollowTopic(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (topic: string) => {
      const wallet = await getWallet();
      return unfollowTopic(wallet, topic, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

// ============================================
// Moderator Follow Hooks
// ============================================

export function useFollowModerator(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (moderatorAddress: string) => {
      const wallet = await getWallet();
      return followModerator(wallet, moderatorAddress, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      // Following moderators affects content filtering
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useUnfollowModerator(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (moderatorAddress: string) => {
      const wallet = await getWallet();
      return unfollowModerator(wallet, moderatorAddress, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}
