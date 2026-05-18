/**
 * useVote Hook
 *
 * Mutation hook for voting on posts/comments
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useTxStatusPolling } from "@/src/api/read/hooks/use-tx-status";
import { vote, type VoteDirection } from "../endpoints/vote";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";
import * as Sentry from "@sentry/react-native";

// ============================================
// Types
// ============================================

export interface VoteMutationInput {
  /** txhash of post/comment to vote on */
  target: string;
  /** Vote direction */
  direction: VoteDirection;
}

export interface UseVoteOptions {
  /** Callback for PoW progress */
  onPoWProgress?: (progress: PoWProgress) => void;
}

// ============================================
// Hooks
// ============================================

/**
 * Basic vote mutation hook
 * 
 * Uses the same pattern as follow - marks queries as stale without
 * triggering an immediate refetch to prevent showing refresh indicator.
 * The optimistic update in the UI handles immediate feedback.
 */
export function useVote(options: UseVoteOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.vote.create(),
    mutationFn: async ({ target, direction }: VoteMutationInput) => {
      const wallet = await getWallet();
      return vote(wallet, { target, direction }, options.onPoWProgress);
    },
    onSuccess: (data, { target }) => {
      // Mark queries as stale but don't trigger an immediate refetch
      // This prevents the refreshing indicator from showing
      // The optimistic update already shows the correct state
      // Posts will be refetched on next navigation or pull-to-refresh
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.postsRoot(),
        refetchType: "none",
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.commentsRoot(),
        refetchType: "none",
      });

      // Invalidate user status (recent_votes updated) - also silent
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
          refetchType: "none",
        });
      }

      return data.tx_hash;
    },
  });
}

/**
 * Vote hook with transaction confirmation polling
 *
 * Use this when you need to know when the vote is confirmed on-chain.
 */
export function useVoteWithConfirmation(options: UseVoteOptions = {}) {
  const voteMutation = useVote(options);
  const [txHash, setTxHash] = useState<string | null>(null);
  const txStatus = useTxStatusPolling(txHash);

  const voteWithConfirmation = async (input: VoteMutationInput) => {
    const result = await voteMutation.mutateAsync(input);
    setTxHash(result.tx_hash);
    return result;
  };

  const reset = () => {
    setTxHash(null);
    voteMutation.reset();
  };

  return {
    vote: voteWithConfirmation,
    mutate: voteMutation.mutate,
    mutateAsync: voteMutation.mutateAsync,
    isPending: voteMutation.isPending,
    isSuccess: voteMutation.isSuccess,
    isError: voteMutation.isError,
    error: voteMutation.error || txStatus.error,
    txHash,
    txStatus: txStatus.data,
    isConfirmed: txStatus.data?.found && txStatus.data?.indexed,
    isPolling: !!txHash && !txStatus.data?.indexed,
    reset,
  };
}

/**
 * Optimistic vote hook
 *
 * Updates the UI immediately and rolls back on failure.
 * Best for interactive voting experiences.
 */
export function useOptimisticVote(options: UseVoteOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.vote.optimistic(),
    mutationFn: async ({ target, direction }: VoteMutationInput) => {
      const wallet = await getWallet();
      return vote(wallet, { target, direction }, options.onPoWProgress);
    },
    // Optimistic update before the mutation completes
    onMutate: async ({ target, direction }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.postsRoot() });
      await queryClient.cancelQueries({ queryKey: queryKeys.commentsRoot() });

      // Snapshot previous data for rollback
      const previousPosts = queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() });
      const previousComments = queryClient.getQueriesData({
        queryKey: queryKeys.commentsRoot(),
      });

      // Optimistically update the vote in cache
      // This is a simplified example - in practice you'd update the specific post
      // in all relevant query caches

      return { previousPosts, previousComments };
    },
    onError: (err, variables, context) => {
      Sentry.captureException(err, {
        tags: { feature: "vote", operation: "vote", direction: variables.direction },
        extra: { target: variables.target },
      });
      if (context?.previousPosts) {
        for (const [key, data] of context.previousPosts) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousComments) {
        for (const [key, data] of context.previousComments) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      // Mark queries as stale but don't trigger an immediate refetch
      // This prevents the refreshing indicator from showing
      // Posts will be refetched on next navigation or pull-to-refresh
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.postsRoot(),
        refetchType: "none",
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.commentsRoot(),
        refetchType: "none",
      });

      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
          refetchType: "none",
        });
      }
    },
  });
}
