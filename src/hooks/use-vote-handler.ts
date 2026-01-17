/**
 * useVoteHandler Hook
 *
 * Provides optimistic voting with POW queue integration.
 * Shows immediate UI feedback and queues POW actions in the background.
 */

import { useCallback, useEffect, useRef } from "react";
import { useVote, type VoteDirection } from "@/src/api/write";
import {
  usePowQueueStore,
  generateActionId,
  getActionLabel,
  type PowActionType,
} from "@/src/services/pow-queue";
import { useAuthGuard } from "./use-auth-guard";

export interface VoteState {
  hasLiked: boolean;
  hasDisliked: boolean;
  likes: number;
}

export interface VoteResult {
  hasLiked: boolean;
  hasDisliked: boolean;
  likeDelta: number;
  direction: VoteDirection;
}

export interface UseVoteHandlerOptions {
  onOptimisticUpdate?: (targetId: string, result: VoteResult) => void;
  onRollback?: (targetId: string, previousState: VoteState) => void;
  onSuccess?: (targetId: string) => void;
}

export interface UseVoteHandlerReturn {
  handleUpvote: (
    targetId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  handleDownvote: (
    targetId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  isPending: boolean;
}

function calculateVoteResult(
  action: "upvote" | "downvote",
  currentlyLiked: boolean,
  currentlyDisliked: boolean
): VoteResult {
  if (action === "upvote") {
    if (currentlyLiked) {
      return {
        hasLiked: false,
        hasDisliked: false,
        likeDelta: -1,
        direction: 0,
      };
    } else if (currentlyDisliked) {
      return {
        hasLiked: true,
        hasDisliked: false,
        likeDelta: 2,
        direction: 1,
      };
    } else {
      return {
        hasLiked: true,
        hasDisliked: false,
        likeDelta: 1,
        direction: 1,
      };
    }
  } else {
    if (currentlyDisliked) {
      return {
        hasLiked: false,
        hasDisliked: false,
        likeDelta: 1,
        direction: 0,
      };
    } else if (currentlyLiked) {
      return {
        hasLiked: false,
        hasDisliked: true,
        likeDelta: -2,
        direction: -1,
      };
    } else {
      return {
        hasLiked: false,
        hasDisliked: true,
        likeDelta: -1,
        direction: -1,
      };
    }
  }
}

function getVoteActionType(direction: VoteDirection): PowActionType {
  if (direction === 1) return "upvote";
  if (direction === -1) return "downvote";
  return "remove_vote";
}

export function useVoteHandler(
  options: UseVoteHandlerOptions = {}
): UseVoteHandlerReturn {
  const { onOptimisticUpdate, onRollback, onSuccess } = options;

  const { requireAuth } = useAuthGuard();
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const pendingVotes = useRef<Set<string>>(new Set());
  const voteMutation = useVote();
  const voteAsyncRef = useRef(voteMutation.mutateAsync);

  useEffect(() => {
    voteAsyncRef.current = voteMutation.mutateAsync;
  }, [voteMutation.mutateAsync]);

  const handleVote = useCallback(
    (
      action: "upvote" | "downvote",
      targetId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number
    ) => {
      if (pendingVotes.current.has(targetId)) {
        return;
      }

      requireAuth(() => {
        pendingVotes.current.add(targetId);

        const result = calculateVoteResult(
          action,
          currentlyLiked,
          currentlyDisliked
        );

        const previousState: VoteState = {
          hasLiked: currentlyLiked,
          hasDisliked: currentlyDisliked,
          likes: currentLikes,
        };

        const actionType = getVoteActionType(result.direction);
        const actionId = generateActionId();

        enqueue({
          id: actionId,
          type: actionType,
          label: getActionLabel(actionType),
          execute: async () => {
            return voteAsyncRef.current({
              target: targetId,
              direction: result.direction,
            });
          },
          onOptimisticUpdate: () => {
            onOptimisticUpdate?.(targetId, result);
          },
          onSuccess: () => {
            pendingVotes.current.delete(targetId);
            onSuccess?.(targetId);
          },
          onError: () => {
            pendingVotes.current.delete(targetId);
          },
          onRollback: () => {
            pendingVotes.current.delete(targetId);
            onRollback?.(targetId, previousState);
          },
        });
      });
    },
    [requireAuth, onOptimisticUpdate, onRollback, onSuccess, enqueue]
  );

  const handleUpvote = useCallback(
    (
      targetId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number
    ) => {
      handleVote(
        "upvote",
        targetId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes
      );
    },
    [handleVote]
  );

  const handleDownvote = useCallback(
    (
      targetId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number
    ) => {
      handleVote(
        "downvote",
        targetId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes
      );
    },
    [handleVote]
  );

  return {
    handleUpvote,
    handleDownvote,
    isPending: voteMutation.isPending,
  };
}
