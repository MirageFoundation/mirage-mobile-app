/**
 * useBlockHandler Hook
 *
 * Provides block functionality with confirmation popup and toast notifications.
 * Handles blocking users, posts, and comments.
 */

import { useCallback, useRef, useState } from "react";
import { useBlockUser, useBlockPost } from "@/src/api/write";
import type { PoWProgress } from "@/src/api/write";
import { useToast } from "@/src/providers/toast-provider";
import { useAuthGuard } from "./use-auth-guard";

// ============================================
// Types
// ============================================

export type BlockType = "user" | "post" | "comment";

export interface BlockTarget {
  id: string;
  type: BlockType;
  /** Display label for the confirmation (e.g., "@username" or "this post") */
  label?: string;
}

export interface UseBlockHandlerOptions {
  /** Called when block succeeds */
  onSuccess?: (targetId: string, blockType: BlockType) => void;
  /** Called when block fails */
  onError?: (targetId: string, error: Error) => void;
}

export interface UseBlockHandlerReturn {
  /** Request blocking a user (shows confirmation popup) */
  requestBlockUser: (userAddress: string, username?: string) => void;
  /** Request blocking a post (shows confirmation popup) */
  requestBlockPost: (postId: string) => void;
  /** Request blocking a comment (shows confirmation popup) */
  requestBlockComment: (commentId: string) => void;
  /** Confirm the pending block */
  confirmBlock: () => void;
  /** Cancel the pending block */
  cancelBlock: () => void;
  /** Whether a block is in progress */
  isBlocking: boolean;
  /** Whether the confirmation popup should be shown */
  showConfirmation: boolean;
  /** The pending block target (if any) */
  pendingBlock: BlockTarget | null;
}

// ============================================
// Hook
// ============================================

export function useBlockHandler(
  options: UseBlockHandlerOptions = {}
): UseBlockHandlerReturn {
  const { onSuccess, onError } = options;

  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  // State for confirmation popup
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<BlockTarget | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);

  // Track current toast ID
  const toastIdRef = useRef<string | null>(null);

  // PoW progress handler for user blocking
  const handleUserPoWProgress = useCallback(
    (progress: PoWProgress) => {
      if (toastIdRef.current) {
        const progressPercent =
          progress.estimatedTotalMs > 0
            ? Math.min(
                99,
                Math.round((progress.elapsedMs / progress.estimatedTotalMs) * 100)
              )
            : 0;
        toast.update(toastIdRef.current, {
          description: `Computing proof of work... ${progressPercent}%`,
        });
      }
    },
    [toast]
  );

  // PoW progress handler for post/comment blocking
  const handlePostPoWProgress = useCallback(
    (progress: PoWProgress) => {
      if (toastIdRef.current) {
        const progressPercent =
          progress.estimatedTotalMs > 0
            ? Math.min(
                99,
                Math.round((progress.elapsedMs / progress.estimatedTotalMs) * 100)
              )
            : 0;
        toast.update(toastIdRef.current, {
          description: `Computing proof of work... ${progressPercent}%`,
        });
      }
    },
    [toast]
  );

  // Create block mutations
  const blockUserMutation = useBlockUser({
    onPoWProgress: handleUserPoWProgress,
  });

  const blockPostMutation = useBlockPost({
    onPoWProgress: handlePostPoWProgress,
  });

  // Request blocking a user
  const requestBlockUser = useCallback(
    (userAddress: string, username?: string) => {
      requireAuth(() => {
        setPendingBlock({
          id: userAddress,
          type: "user",
          label: username ? `@${username}` : "this user",
        });
        setShowConfirmation(true);
      });
    },
    [requireAuth]
  );

  // Request blocking a post
  const requestBlockPost = useCallback(
    (postId: string) => {
      requireAuth(() => {
        setPendingBlock({
          id: postId,
          type: "post",
          label: "this post",
        });
        setShowConfirmation(true);
      });
    },
    [requireAuth]
  );

  // Request blocking a comment
  const requestBlockComment = useCallback(
    (commentId: string) => {
      requireAuth(() => {
        setPendingBlock({
          id: commentId,
          type: "comment",
          label: "this comment",
        });
        setShowConfirmation(true);
      });
    },
    [requireAuth]
  );

  // Cancel block
  const cancelBlock = useCallback(() => {
    setShowConfirmation(false);
    setPendingBlock(null);
  }, []);

  // Confirm and execute block
  const confirmBlock = useCallback(async () => {
    if (!pendingBlock) return;

    const { id: targetId, type: blockType, label } = pendingBlock;

    setShowConfirmation(false);
    setIsBlocking(true);

    // Show loading toast
    const toastId = toast.loading(
      `Blocking ${label || "content"}...`,
      "Computing proof of work..."
    );
    toastIdRef.current = toastId;

    try {
      // Use appropriate mutation based on block type
      if (blockType === "user") {
        await blockUserMutation.mutateAsync(targetId);
      } else {
        // Both posts and comments use blockPost (comments have txhash like posts)
        await blockPostMutation.mutateAsync(targetId);
      }

      // Success
      const successLabel =
        blockType === "user"
          ? `User ${label} blocked`
          : blockType === "post"
            ? "Post hidden"
            : "Comment hidden";

      toast.update(toastId, {
        type: "success",
        title: successLabel,
        description: "You won't see this content anymore",
        duration: 3000,
      });
      setTimeout(() => toast.dismiss(toastId), 3000);

      onSuccess?.(targetId, blockType);
    } catch (error) {
      // Error
      const errorMessage =
        error instanceof Error ? error.message : "Please try again";

      toast.update(toastId, {
        type: "error",
        title: "Failed to block",
        description: errorMessage,
        duration: 4000,
      });
      setTimeout(() => toast.dismiss(toastId), 4000);

      if (error instanceof Error) {
        onError?.(targetId, error);
      } else {
        onError?.(targetId, new Error(String(error)));
      }
    } finally {
      setIsBlocking(false);
      setPendingBlock(null);
      toastIdRef.current = null;
    }
  }, [
    pendingBlock,
    toast,
    blockUserMutation,
    blockPostMutation,
    onSuccess,
    onError,
  ]);

  return {
    requestBlockUser,
    requestBlockPost,
    requestBlockComment,
    confirmBlock,
    cancelBlock,
    isBlocking,
    showConfirmation,
    pendingBlock,
  };
}
