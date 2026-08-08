/**
 * Follow/Unfollow Mutation Hooks
 */

import { queryKeys } from "@/src/api/read/query-keys";
import { toggleFollowedTopics } from "@/src/domain/topics";
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

/**
 * A duplicate follow means the user's intent is already satisfied — keep the
 * optimistic state instead of rolling back and reporting an error.
 *
 * The node's duplicate-follow guard predates its error_code registry and still
 * responds `{"error": "topic is already followed"}` with no `error_code`
 * (`routes/core.py` follow_user/follow_topic), so `parseApiError` yields
 * `errorCode: null` and a code-only check never matches. Match the message text
 * too, the same way the web client does.
 */
function isAlreadyFollowedError(error: unknown, isCurrentlyFollowing: boolean) {
  if (isCurrentlyFollowing) return false;

  const parsed = parseApiError(error);
  if (
    parsed.errorCode === "user_already_followed" ||
    parsed.errorCode === "topic_already_followed"
  ) return true;

  return parsed.message.toLowerCase().includes("already follow");
}

const markPostsStaleAfterFollow = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({
    queryKey: queryKeys.postsRoot(),
    refetchType: "none",
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.postsRoot(),
    refetchType: "active",
    predicate: (query) => {
      // Posts keys are ["server", <url>, "posts", "viewer", <addr>, filters]:
      // the filters object is the LAST element, not queryKey[1].
      const filters = query.queryKey.at(-1);
      return !!filters
        && typeof filters === "object"
        && (filters as { feed?: unknown }).feed === "following";
    },
  });
  addFollowBreadcrumb("Posts marked stale; active following feeds refetched");
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
      // Following changes feed composition; keep home stale and refresh active Following feeds.
      markPostsStaleAfterFollow(queryClient);
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
      markPostsStaleAfterFollow(queryClient);
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
      // Topic follows change feed composition; keep home stale and refresh active Following feeds.
      markPostsStaleAfterFollow(queryClient);
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
      markPostsStaleAfterFollow(queryClient);
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
      // Agent changes affect filtering; keep home stale and refresh active Following feeds.
      markPostsStaleAfterFollow(queryClient);
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
      markPostsStaleAfterFollow(queryClient);
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

      // Optimistically update the followed list. The entry MUST be normalized:
      // the server only ever stores lowercase topics, so an entry keyed by the
      // display casing silently disappears on the next refetch and the button
      // snaps back to "Follow" (then a retry fails with "already followed").
      if (address) {
        queryClient.setQueryData<{
          followed_users: string[];
          followed_topics: string[];
          enabled_agents: string[];
        }>(queryKeys.userFollowed(address), (old) => {
          if (!old) {
            return {
              followed_users: [],
              followed_topics: toggleFollowedTopics([], topic, !isCurrentlyFollowing),
              enabled_agents: [],
            };
          }
          const newFollowedTopics = toggleFollowedTopics(
            old.followed_topics,
            topic,
            !isCurrentlyFollowing,
          );

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
        markPostsStaleAfterFollow(queryClient);
      }, 5000);
    },
    onError: (err, { topic, isCurrentlyFollowing }, context) => {
      const parsed = parseApiError(err);
      const errorCode = parsed.errorCode;

      console.log(`[FollowTopic] Error received: ${errorCode ?? parsed.message}`);

      if (isAlreadyFollowedError(err, isCurrentlyFollowing)) {
        addFollowBreadcrumb("Topic already followed; optimistic state kept", {
          topic,
        });
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
    onSettled: (_data, error, { isCurrentlyFollowing }) => {
      markPostsStaleAfterFollow(queryClient);

      if (error && !isAlreadyFollowedError(error, isCurrentlyFollowing) && address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
          refetchType: "none",
        });
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
        markPostsStaleAfterFollow(queryClient);
      }, 5000);
    },
    onError: (err, { userAddress, isCurrentlyFollowing }, context) => {
      const parsed = parseApiError(err);
      const errorCode = parsed.errorCode;

      console.log(`[Follow] Error received: ${errorCode ?? parsed.message}`);

      if (isAlreadyFollowedError(err, isCurrentlyFollowing)) {
        addFollowBreadcrumb("User already followed; optimistic state kept", {
          userAddress,
        });
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
    onSettled: (_data, error, { isCurrentlyFollowing }) => {
      markPostsStaleAfterFollow(queryClient);

      if (error && !isAlreadyFollowedError(error, isCurrentlyFollowing) && address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
          refetchType: "none",
        });
      }
    },
  });
}
