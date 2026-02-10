/**
 * useVoteHandler Hook
 *
 * Provides optimistic voting with POW queue integration.
 * Shows immediate UI feedback and queues POW actions in the background.
 * Supports cancelling in-flight votes when user changes their mind
 * (e.g., upvote then immediately downvote, or undo before POW finishes).
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
  newLikes: number;
}

type BaseVoteResult = Omit<VoteResult, "newLikes">;

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

interface PendingVoteInfo {
  actionId: string;
  previousState: VoteState;
  optimisticResult: VoteResult;
}

function calculateVoteResult(
  action: "upvote" | "downvote",
  currentlyLiked: boolean,
  currentlyDisliked: boolean
): BaseVoteResult {
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

function getDirectionFromState(hasLiked: boolean, hasDisliked: boolean): number {
  if (hasLiked) return 1;
  if (hasDisliked) return -1;
  return 0;
}

export function useVoteHandler(
  options: UseVoteHandlerOptions = {}
): UseVoteHandlerReturn {
  const { onOptimisticUpdate, onRollback, onSuccess } = options;

  const { requireAuth } = useAuthGuard();
  const enqueue = usePowQueueStore((state) => state.enqueue);
  const cancelAction = usePowQueueStore((state) => state.cancelAction);

  const pendingVotes = useRef<Map<string, PendingVoteInfo>>(new Map());
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
      const pending = pendingVotes.current.get(targetId);

      if (pending) {
        cancelAction(pending.actionId);

        pendingVotes.current.delete(targetId);
        onRollback?.(targetId, pending.previousState);

        const desiredResult = calculateVoteResult(
          action,
          pending.optimisticResult.hasLiked,
          pending.optimisticResult.hasDisliked
        );

        const desiredDirection = getDirectionFromState(
          desiredResult.hasLiked,
          desiredResult.hasDisliked
        );
        const originalDirection = getDirectionFromState(
          pending.previousState.hasLiked,
          pending.previousState.hasDisliked
        );

        if (desiredDirection === originalDirection) {
          return;
        }

        requireAuth(() => {
          const likeDelta = desiredDirection - originalDirection;
          const newResult: VoteResult = {
            hasLiked: desiredDirection === 1,
            hasDisliked: desiredDirection === -1,
            likeDelta,
            direction: desiredDirection as VoteDirection,
            newLikes: pending.previousState.likes + likeDelta,
          };

          const actionType = getVoteActionType(newResult.direction);
          const newActionId = generateActionId();

          pendingVotes.current.set(targetId, {
            actionId: newActionId,
            previousState: pending.previousState,
            optimisticResult: newResult,
          });

          enqueue({
            id: newActionId,
            type: actionType,
            label: getActionLabel(actionType),
            execute: async () => {
              return voteAsyncRef.current({
                target: targetId,
                direction: newResult.direction,
              });
            },
            onOptimisticUpdate: () => {
              onOptimisticUpdate?.(targetId, newResult);
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
              onRollback?.(targetId, pending.previousState);
            },
          });
        });

        return;
      }

      requireAuth(() => {
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

        const newLikes = currentLikes + result.likeDelta;
        const resultWithLikes: VoteResult = { ...result, newLikes };

        const actionType = getVoteActionType(result.direction);
        const actionId = generateActionId();

        pendingVotes.current.set(targetId, {
          actionId,
          previousState,
          optimisticResult: resultWithLikes,
        });

        enqueue({
          id: actionId,
          type: actionType,
          label: getActionLabel(actionType),
          execute: async () => {
            return voteAsyncRef.current({
              target: targetId,
              direction: resultWithLikes.direction,
            });
          },
          onOptimisticUpdate: () => {
            onOptimisticUpdate?.(targetId, resultWithLikes);
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
    [requireAuth, onOptimisticUpdate, onRollback, onSuccess, enqueue, cancelAction]
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
