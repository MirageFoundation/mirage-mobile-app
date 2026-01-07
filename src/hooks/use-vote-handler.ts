/**
 * useVoteHandler Hook
 *
 * Provides optimistic voting with toast notifications.
 * Shows immediate UI feedback and handles API calls in the background.
 */

import { useCallback, useRef } from "react";
import { useVote, type VoteDirection } from "@/src/api/write";
import type { PoWProgress } from "@/src/api/write";
import { useToast } from "@/src/providers/toast-provider";
import { useAuthGuard } from "./use-auth-guard";

// ============================================
// Types
// ============================================

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
  /** Called when vote is initiated (for optimistic UI update) */
  onOptimisticUpdate?: (targetId: string, result: VoteResult) => void;
  /** Called when vote fails (for rollback) */
  onRollback?: (targetId: string, previousState: VoteState) => void;
  /** Called when vote succeeds (after confirmation) */
  onSuccess?: (targetId: string) => void;
}

export interface UseVoteHandlerReturn {
  /** Handle upvote press */
  handleUpvote: (
    targetId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  /** Handle downvote press */
  handleDownvote: (
    targetId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  /** Whether any vote is currently pending */
  isPending: boolean;
}

// ============================================
// Helpers
// ============================================

/**
 * Calculate the new vote state and delta based on the action
 */
function calculateVoteResult(
  action: "upvote" | "downvote",
  currentlyLiked: boolean,
  currentlyDisliked: boolean
): VoteResult {
  if (action === "upvote") {
    if (currentlyLiked) {
      // Already liked, removing like
      return {
        hasLiked: false,
        hasDisliked: false,
        likeDelta: -1,
        direction: 0, // Remove vote
      };
    } else if (currentlyDisliked) {
      // Was disliked, now liking: +2 (remove dislike + add like)
      return {
        hasLiked: true,
        hasDisliked: false,
        likeDelta: 2,
        direction: 1, // Upvote
      };
    } else {
      // Neutral, adding like
      return {
        hasLiked: true,
        hasDisliked: false,
        likeDelta: 1,
        direction: 1, // Upvote
      };
    }
  } else {
    // Downvote action
    if (currentlyDisliked) {
      // Already disliked, removing dislike
      return {
        hasLiked: false,
        hasDisliked: false,
        likeDelta: 1,
        direction: 0, // Remove vote
      };
    } else if (currentlyLiked) {
      // Was liked, now disliking: -2 (remove like + add dislike)
      return {
        hasLiked: false,
        hasDisliked: true,
        likeDelta: -2,
        direction: -1, // Downvote
      };
    } else {
      // Neutral, adding dislike
      return {
        hasLiked: false,
        hasDisliked: true,
        likeDelta: -1,
        direction: -1, // Downvote
      };
    }
  }
}

/**
 * Get user-friendly action text for toast messages
 */
function getActionText(result: VoteResult): string {
  if (result.direction === 1) {
    return "Upvoting";
  } else if (result.direction === -1) {
    return "Downvoting";
  } else {
    return "Removing vote";
  }
}

/**
 * Get success message for toast
 */
function getSuccessText(result: VoteResult): string {
  if (result.direction === 1) {
    return "Upvoted successfully";
  } else if (result.direction === -1) {
    return "Downvoted successfully";
  } else {
    return "Vote removed";
  }
}

// ============================================
// Hook
// ============================================

export function useVoteHandler(
  options: UseVoteHandlerOptions = {}
): UseVoteHandlerReturn {
  const { onOptimisticUpdate, onRollback, onSuccess } = options;

  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  // Track pending votes to prevent double-taps
  const pendingVotes = useRef<Set<string>>(new Set());

  // Track current toast IDs for each target
  const toastIds = useRef<Map<string, string>>(new Map());

  // Track PoW progress updates
  const handlePoWProgress = useCallback(
    (targetId: string, progress: PoWProgress) => {
      const toastId = toastIds.current.get(targetId);
      if (toastId) {
        const progressPercent = Math.min(
          100,
          Math.round((progress.elapsedMs / progress.estimatedTotalMs) * 100)
        );
        toast.update(toastId, {
          description: `Computing proof of work... ${progressPercent}%`,
        });
      }
    },
    [toast]
  );

  // Create vote mutation with PoW progress tracking
  const voteMutation = useVote();

  const executeVote = useCallback(
    async (
      targetId: string,
      result: VoteResult,
      previousState: VoteState
    ) => {
      // Show initial loading toast
      const toastId = toast.loading(
        getActionText(result),
        "Computing proof of work..."
      );
      toastIds.current.set(targetId, toastId);

      try {
        // Execute vote mutation
        await voteMutation.mutateAsync(
          {
            target: targetId,
            direction: result.direction,
          },
          {
            onSuccess: () => {
              // Update toast to success
              toast.update(toastId, {
                type: "success",
                title: getSuccessText(result),
                description: undefined,
                duration: 2000,
              });
              setTimeout(() => toast.dismiss(toastId), 2000);

              // Call success callback
              onSuccess?.(targetId);
            },
            onError: (error) => {
              // Handle error - rollback optimistic update
              const errorMessage =
                error instanceof Error ? error.message : String(error);

              // Update toast to error
              toast.update(toastId, {
                type: "error",
                title: "Vote failed",
                description: errorMessage || "Please try again",
                duration: 4000,
              });
              setTimeout(() => toast.dismiss(toastId), 4000);

              // Rollback
              onRollback?.(targetId, previousState);
            },
          }
        );
      } catch (error) {
        // This catch is for any unhandled errors
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        toast.update(toastId, {
          type: "error",
          title: "Vote failed",
          description: errorMessage || "Please try again",
          duration: 4000,
        });
        setTimeout(() => toast.dismiss(toastId), 4000);

        // Rollback
        onRollback?.(targetId, previousState);
      } finally {
        // Clean up
        pendingVotes.current.delete(targetId);
        toastIds.current.delete(targetId);
      }
    },
    [toast, voteMutation, onRollback, onSuccess]
  );

  const handleVote = useCallback(
    (
      action: "upvote" | "downvote",
      targetId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number
    ) => {
      // Prevent double-taps
      if (pendingVotes.current.has(targetId)) {
        return;
      }

      requireAuth(() => {
        // Mark as pending
        pendingVotes.current.add(targetId);

        // Calculate result
        const result = calculateVoteResult(
          action,
          currentlyLiked,
          currentlyDisliked
        );

        // Store previous state for rollback
        const previousState: VoteState = {
          hasLiked: currentlyLiked,
          hasDisliked: currentlyDisliked,
          likes: currentLikes,
        };

        // Apply optimistic update immediately
        onOptimisticUpdate?.(targetId, result);

        // Execute vote in background
        executeVote(targetId, result, previousState);
      });
    },
    [requireAuth, onOptimisticUpdate, executeVote]
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

