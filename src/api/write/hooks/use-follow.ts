/**
 * Follow/Unfollow Mutation Hooks
 */

import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  followTopic,
  followUser,
  unfollowTopic,
  unfollowUser,
  enableAgent,
  disableAgent,
} from "../endpoints/social";
import type { PoWProgress, WriteResponse } from "../signing";
import * as Sentry from "@sentry/react-native";
import { parseApiError } from "@/src/utils/parse-api-error";
import { trackEvent } from "@/src/services/analytics";
import { mutationKeys } from "../mutation-keys";

const addFollowBreadcrumb = (
  operation: string,
  data?: Record<string, unknown>,
) => {
  Sentry.addBreadcrumb({
    category: "follow",
    message: operation,
    level: "info",
    data,
  });
};

const markPostsStaleWithoutRefetch = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.postsRoot(),
    refetchType: "none",
  });
  addFollowBreadcrumb("Posts marked stale without active refetch");
};

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
    mutationKey: mutationKeys.follow.user(),
    mutationFn: async (userAddress: string) => {
      const wallet = await getWallet();
      return followUser(wallet, userAddress, options.onPoWProgress);
    },
    onSuccess: () => {
      trackEvent("user_followed");
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      // Following can affect feed composition, but don't refetch the visible feed.
      markPostsStaleWithoutRefetch(queryClient);
    },
  });
}

export function useUnfollowUser(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.follow.unfollowUser(),
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
      markPostsStaleWithoutRefetch(queryClient);
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
    mutationKey: mutationKeys.follow.topic(),
    mutationFn: async (topic: string) => {
      const wallet = await getWallet();
      return followTopic(wallet, topic, options.onPoWProgress);
    },
    onSuccess: () => {
      trackEvent("topic_followed");
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      // Topic following can affect feed composition, but don't refetch the visible feed.
      markPostsStaleWithoutRefetch(queryClient);
    },
  });
}

export function useUnfollowTopic(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.follow.unfollowTopic(),
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
      markPostsStaleWithoutRefetch(queryClient);
    },
  });
}

// ============================================
// Agent Enable/Disable Hooks
// ============================================

export function useEnableAgent(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.follow.enableAgent(),
    mutationFn: async (agentAddress: string) => {
      const wallet = await getWallet();
      return enableAgent(wallet, agentAddress, options.onPoWProgress);
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
      // Enabling agents affects content filtering, but don't refetch the visible feed.
      markPostsStaleWithoutRefetch(queryClient);
    },
  });
}

export function useDisableAgent(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.follow.disableAgent(),
    mutationFn: async (agentAddress: string) => {
      const wallet = await getWallet();
      return disableAgent(wallet, agentAddress, options.onPoWProgress);
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
      markPostsStaleWithoutRefetch(queryClient);
    },
  });
}

// ============================================
// Toggle Follow Topic Hook (Combined Follow/Unfollow)
// ============================================

export interface ToggleFollowTopicParams {
  topic: string;
  isCurrentlyFollowing: boolean;
}

/**
 * Combined hook that handles both follow and unfollow topic based on current state.
 * Includes optimistic updates for immediate UI feedback.
 */
export function useToggleFollowTopic(options: UseFollowOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.follow.toggleTopic(),
    mutationFn: async ({
      topic,
      isCurrentlyFollowing,
    }: ToggleFollowTopicParams): Promise<WriteResponse> => {
      const wallet = await getWallet();
      console.log(
        `[FollowTopic] ${
          isCurrentlyFollowing ? "Unfollowing" : "Following"
        } topic: ${topic}`
      );
      if (isCurrentlyFollowing) {
        return unfollowTopic(wallet, topic, options.onPoWProgress);
      } else {
        return followTopic(wallet, topic, options.onPoWProgress);
      }
    },
    onMutate: async ({ topic, isCurrentlyFollowing }) => {
      console.log(
        `[FollowTopic] onMutate: ${
          isCurrentlyFollowing ? "unfollow" : "follow"
        } ${topic}`
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
            enabled_agents: string[];
          }>(queryKeys.userFollowed(address))
        : undefined;

      // Optimistically update the followed list
      if (address) {
        queryClient.setQueryData<{
          followed_users: string[];
          followed_topics: string[];
          enabled_agents: string[];
        }>(queryKeys.userFollowed(address), (old) => {
          if (!old) {
            return {
              followed_users: [],
              followed_topics: isCurrentlyFollowing ? [] : [topic],
              enabled_agents: [],
            };
          }
          const newFollowedTopics = isCurrentlyFollowing
            ? old.followed_topics.filter((t) => t !== topic)
            : [...old.followed_topics, topic];

          console.log(
            `[FollowTopic] Optimistic update: ${old.followed_topics.length} -> ${newFollowedTopics.length} topics`
          );

          return {
            ...old,
            followed_topics: newFollowedTopics,
          };
        });
      }

      return { previousFollowed, topic, isCurrentlyFollowing };
    },
    onSuccess: (_data, { topic, isCurrentlyFollowing }) => {
      console.log(
        `[FollowTopic] Success! ${
          isCurrentlyFollowing ? "Unfollowed" : "Followed"
        } ${topic}`
      );

      if (!isCurrentlyFollowing) {
        trackEvent("topic_followed", { topic });
      }

      // Delay the query invalidation to give the indexer time to process
      setTimeout(() => {
        console.log(`[FollowTopic] Delayed refetch after successful follow`);
        if (address) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.userFollowed(address),
            refetchType: "active",
          });
        }
        markPostsStaleWithoutRefetch(queryClient);
      }, 5000);
    },
    onError: (err, { topic, isCurrentlyFollowing }, context) => {
      const parsed = parseApiError(err);
      const errorCode = parsed.errorCode;

      console.log(`[FollowTopic] Error received: ${errorCode ?? parsed.message}`);

      const isAlreadyFollowedError =
        !isCurrentlyFollowing && errorCode === "topic_already_followed";
      const isNotFollowingError =
        isCurrentlyFollowing && errorCode === "topic_already_followed";

      if (isAlreadyFollowedError || isNotFollowingError) {
        console.log(
          `[FollowTopic] State already matches desired state, no rollback needed`
        );
        return;
      }

      Sentry.captureException(err, {
        tags: { feature: "follow", operation: "follow-topic" },
        extra: { topic, isCurrentlyFollowing, errorCode, errorMessage: parsed.message },
      });
      console.log(`[FollowTopic] Error, rolling back: ${parsed.message}`);
      if (address && context?.previousFollowed) {
        queryClient.setQueryData(
          queryKeys.userFollowed(address),
          context.previousFollowed
        );
      }
    },
    onSettled: (_data, error) => {
      markPostsStaleWithoutRefetch(queryClient);

      if (error) {
        const parsed = parseApiError(error);
        const isStateMismatch = parsed.errorCode === "topic_already_followed";

        if (!isStateMismatch && address) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.userFollowed(address),
            refetchType: "none",
          });
        }
      }
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
    mutationKey: mutationKeys.follow.toggleUser(),
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
            enabled_agents: string[];
          }>(queryKeys.userFollowed(address))
        : undefined;

      // Optimistically update the followed list
      if (address) {
        queryClient.setQueryData<{
          followed_users: string[];
          followed_topics: string[];
          enabled_agents: string[];
        }>(queryKeys.userFollowed(address), (old) => {
          if (!old) {
            // If no cache exists, create a new one with just this user
            return {
              followed_users: isCurrentlyFollowing ? [] : [userAddress],
              followed_topics: [],
              enabled_agents: [],
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

      if (!isCurrentlyFollowing) {
        trackEvent("user_followed");
      }

      // Delay the query invalidation to give the indexer time to process
      // The optimistic update will show the correct state immediately
      // After 5 seconds, we silently refetch to ensure consistency
      setTimeout(() => {
        console.log(`[Follow] Delayed refetch after successful follow`);
        if (address) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.userFollowed(address),
            refetchType: "active",
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.profile(address),
            refetchType: "none",
          });
        }
        markPostsStaleWithoutRefetch(queryClient);
      }, 5000);
    },
    onError: (err, { userAddress, isCurrentlyFollowing }, context) => {
      const parsed = parseApiError(err);
      const errorCode = parsed.errorCode;

      console.log(`[Follow] Error received: ${errorCode ?? parsed.message}`);

      const isAlreadyFollowedError =
        !isCurrentlyFollowing && errorCode === "user_already_followed";
      const isNotFollowingError =
        isCurrentlyFollowing && errorCode === "user_already_followed";

      if (isAlreadyFollowedError || isNotFollowingError) {
        console.log(
          `[Follow] State already matches desired state, no rollback needed`
        );
        return;
      }

      Sentry.captureException(err, {
        tags: { feature: "follow", operation: "follow-user" },
        extra: { userAddress, isCurrentlyFollowing, errorCode, errorMessage: parsed.message },
      });
      console.log(`[Follow] Error, rolling back: ${parsed.message}`);
      if (address && context?.previousFollowed) {
        queryClient.setQueryData(
          queryKeys.userFollowed(address),
          context.previousFollowed
        );
      }
    },
    onSettled: (_data, error) => {
      markPostsStaleWithoutRefetch(queryClient);

      if (error) {
        const parsed = parseApiError(error);
        const isStateMismatch = parsed.errorCode === "user_already_followed";

        if (!isStateMismatch && address) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.userFollowed(address),
            refetchType: "none",
          });
        }
      }
    },
  });
}
