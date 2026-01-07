/**
 * Follow/Unfollow Mutation Hooks
 */

import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  followModerator,
  followTopic,
  followUser,
  unfollowModerator,
  unfollowTopic,
  unfollowUser,
} from "../endpoints/social";
import type { PoWProgress, WriteResponse } from "../signing";

// ============================================
// Types
// ============================================

export interface UseFollowOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export interface ToggleFollowUserParams {
  userAddress: string;
  isCurrentlyFollowing: boolean;
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

// ============================================
// Toggle Follow User Hook (Combined Follow/Unfollow)
// ============================================

/**
 * Combined hook that handles both follow and unfollow based on current state.
 * Includes optimistic updates for immediate UI feedback.
 */
export function useToggleFollowUser(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async ({
      userAddress,
      isCurrentlyFollowing,
    }: ToggleFollowUserParams): Promise<WriteResponse> => {
      const wallet = await getWallet();
      console.log(
        `[Follow] ${
          isCurrentlyFollowing ? "Unfollowing" : "Following"
        } user: ${userAddress}`
      );
      if (isCurrentlyFollowing) {
        return unfollowUser(wallet, userAddress, options.onPoWProgress);
      } else {
        return followUser(wallet, userAddress, options.onPoWProgress);
      }
    },
    onMutate: async ({ userAddress, isCurrentlyFollowing }) => {
      console.log(
        `[Follow] onMutate: ${
          isCurrentlyFollowing ? "unfollow" : "follow"
        } ${userAddress}`
      );

      // Cancel any outgoing refetches
      if (address) {
        await queryClient.cancelQueries({
          queryKey: queryKeys.userFollowed(address),
        });
      }

      // Snapshot the previous value
      const previousFollowed = address
        ? queryClient.getQueryData<{
            followed_users: string[];
            followed_topics: string[];
            followed_moderators: string[];
          }>(queryKeys.userFollowed(address))
        : undefined;

      // Optimistically update the followed list
      if (address) {
        queryClient.setQueryData<{
          followed_users: string[];
          followed_topics: string[];
          followed_moderators: string[];
        }>(queryKeys.userFollowed(address), (old) => {
          if (!old) {
            // If no cache exists, create a new one with just this user
            return {
              followed_users: isCurrentlyFollowing ? [] : [userAddress],
              followed_topics: [],
              followed_moderators: [],
            };
          }
          const newFollowedUsers = isCurrentlyFollowing
            ? old.followed_users.filter((u) => u !== userAddress)
            : [...old.followed_users, userAddress];

          console.log(
            `[Follow] Optimistic update: ${old.followed_users.length} -> ${newFollowedUsers.length} users`
          );

          return {
            ...old,
            followed_users: newFollowedUsers,
          };
        });
      }

      return { previousFollowed, userAddress, isCurrentlyFollowing };
    },
    onSuccess: (_data, { userAddress, isCurrentlyFollowing }) => {
      console.log(
        `[Follow] Success! ${
          isCurrentlyFollowing ? "Unfollowed" : "Followed"
        } ${userAddress}`
      );

      // Delay the query invalidation to give the indexer time to process
      // The optimistic update will show the correct state immediately
      // After 5 seconds, we silently refetch to ensure consistency
      setTimeout(() => {
        console.log(`[Follow] Delayed refetch after successful follow`);
        if (address) {
          // Use refetchType: 'active' to only refetch if the query is currently being used
          // This prevents showing a loading indicator
          queryClient.invalidateQueries({
            queryKey: queryKeys.userFollowed(address),
            refetchType: "active",
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.profile(address),
            refetchType: "none",
          });
        }
      }, 5000);
    },
    onError: (err, { userAddress, isCurrentlyFollowing }, context) => {
      // Try to get the actual error message from the API response
      let errorMessage = String(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axiosError = err as any;
      if (axiosError?.response?.data?.error) {
        errorMessage = axiosError.response.data.error;
      }

      console.log(`[Follow] Error received: ${errorMessage}`);

      // Check if error is because user is already in the desired state
      // These aren't real errors - just state mismatches we can handle gracefully
      const isAlreadyFollowedError =
        !isCurrentlyFollowing && errorMessage.includes("already followed");
      const isNotFollowingError =
        isCurrentlyFollowing &&
        (errorMessage.includes("not following") ||
          errorMessage.includes("not in followed") ||
          errorMessage.includes("user not followed"));

      if (isAlreadyFollowedError || isNotFollowingError) {
        // Not a real error - user is already in the desired state
        // Don't rollback the optimistic update
        console.log(
          `[Follow] State already matches desired state, no rollback needed`
        );
        return;
      }

      // Actual error - rollback the optimistic update
      console.log(`[Follow] Error, rolling back: ${errorMessage}`);
      if (address && context?.previousFollowed) {
        queryClient.setQueryData(
          queryKeys.userFollowed(address),
          context.previousFollowed
        );
      }
    },
    onSettled: (_data, error) => {
      // Mark posts as stale but don't trigger an immediate refetch
      // This prevents the refreshing indicator from showing
      // Posts will be refetched on next navigation or pull-to-refresh
      queryClient.invalidateQueries({
        queryKey: ["posts"],
        refetchType: "none",
      });

      // If there was an error (and it wasn't a "state mismatch" error),
      // we should refetch to get the correct state
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axiosError = error as any;
        const errorMessage = axiosError?.response?.data?.error || String(error);
        const isStateMismatch =
          errorMessage.includes("already followed") ||
          errorMessage.includes("not following") ||
          errorMessage.includes("not in followed") ||
          errorMessage.includes("user not followed");

        if (!isStateMismatch && address) {
          // Real error - refetch to get correct state (silent, no indicator)
          queryClient.invalidateQueries({
            queryKey: queryKeys.userFollowed(address),
            refetchType: "none",
          });
        }
      }
    },
  });
}
