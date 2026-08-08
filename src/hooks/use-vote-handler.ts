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
import { trackEvent } from "@/src/services/analytics";
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
  /** Set once the action is actually enqueued; null while debouncing. */
  actionId: string | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  previousState: VoteState;
  optimisticResult: VoteResult;
}

/**
 * Rapid direction changes are coalesced: the optimistic UI updates on every
 * tap, but the PoW action is only enqueued after the user settles. This keeps
 * up->down toggles from launching (and then cancelling) native Argon2
 * computations back-to-back, which saturated the CPU on low-end devices.
 */
const VOTE_ENQUEUE_DEBOUNCE_MS = 400;

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

function getVoteTypeLabel(direction: VoteDirection): "up" | "down" | "remove" {
  if (direction === 1) return "up";
  if (direction === -1) return "down";
  return "remove";
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

  const enqueuePendingVote = useCallback(
    (targetId: string) => {
      const pending = pendingVotes.current.get(targetId);
      if (!pending || pending.actionId) return;

      const result = pending.optimisticResult;
      const previousState = pending.previousState;
      const actionType = getVoteActionType(result.direction);
      const actionId = generateActionId();
      pending.debounceTimer = null;
      pending.actionId = actionId;

      const clearIfCurrent = () => {
        const current = pendingVotes.current.get(targetId);
        if (current?.actionId === actionId) {
          pendingVotes.current.delete(targetId);
        }
      };

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
        onSuccess: () => {
          clearIfCurrent();
          trackEvent("vote_cast", {
            vote_type: getVoteTypeLabel(result.direction),
          });
          onSuccess?.(targetId);
        },
        onError: () => {
          clearIfCurrent();
        },
        onRollback: () => {
          clearIfCurrent();
          onRollback?.(targetId, previousState);
        },
      });
    },
    [enqueue, onRollback, onSuccess]
  );

  const schedulePendingVote = useCallback(
    (targetId: string, previousState: VoteState, result: VoteResult) => {
      // Apply the optimistic UI immediately; the queue action is debounced so
      // rapid direction changes never launch overlapping PoW computations.
      onOptimisticUpdate?.(targetId, result);

      const info: PendingVoteInfo = {
        actionId: null,
        debounceTimer: null,
        previousState,
        optimisticResult: result,
      };
      info.debounceTimer = setTimeout(() => {
        info.debounceTimer = null;
        enqueuePendingVote(targetId);
      }, VOTE_ENQUEUE_DEBOUNCE_MS);
      pendingVotes.current.set(targetId, info);
    },
    [enqueuePendingVote, onOptimisticUpdate]
  );

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
        // Cancel whatever is outstanding for this target: a debounced vote
        // that never reached the queue, or an already-enqueued action.
        if (pending.debounceTimer) {
          clearTimeout(pending.debounceTimer);
          pending.debounceTimer = null;
        }
        if (pending.actionId) {
          cancelAction(pending.actionId);
        }

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
          schedulePendingVote(targetId, pending.previousState, newResult);
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
        schedulePendingVote(targetId, previousState, { ...result, newLikes });
      });
    },
    [requireAuth, onRollback, cancelAction, schedulePendingVote]
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
