/**
 * useBlockHandler Hook
 *
 * Provides block functionality with confirmation popup and POW queue integration.
 */

import { useCallback, useState } from "react";
import { useBlockUser, useBlockPost } from "@/src/api/write";
import {
  usePowQueueStore,
  generateActionId,
} from "@/src/services/pow-queue";
import { useAuthGuard } from "./use-auth-guard";

export type BlockType = "user" | "post" | "comment";

export interface BlockTarget {
  id: string;
  type: BlockType;
  label?: string;
}

export interface UseBlockHandlerOptions {
  onSuccess?: (targetId: string, blockType: BlockType) => void;
  onError?: (targetId: string, error: Error) => void;
}

export interface UseBlockHandlerReturn {
  requestBlockUser: (userAddress: string, username?: string) => void;
  requestBlockPost: (postId: string) => void;
  requestBlockComment: (commentId: string) => void;
  confirmBlock: () => void;
  cancelBlock: () => void;
  isBlocking: boolean;
  showConfirmation: boolean;
  pendingBlock: BlockTarget | null;
}

export function useBlockHandler(
  options: UseBlockHandlerOptions = {}
): UseBlockHandlerReturn {
  const { onSuccess, onError } = options;

  const { requireAuth } = useAuthGuard();
  const { enqueue } = usePowQueueStore();

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<BlockTarget | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);

  const blockUserMutation = useBlockUser();
  const blockPostMutation = useBlockPost();

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

  const cancelBlock = useCallback(() => {
    setShowConfirmation(false);
    setPendingBlock(null);
  }, []);

  const confirmBlock = useCallback(() => {
    if (!pendingBlock) return;

    const { id: targetId, type: blockType, label } = pendingBlock;

    setShowConfirmation(false);
    setIsBlocking(true);

    const actionId = generateActionId();
    const actionLabel = `Blocking ${label || "content"}`;

    enqueue({
      id: actionId,
      type: "block",
      label: actionLabel,
      execute: async () => {
        if (blockType === "user") {
          return blockUserMutation.mutateAsync(targetId);
        } else {
          return blockPostMutation.mutateAsync(targetId);
        }
      },
      onSuccess: () => {
        setIsBlocking(false);
        setPendingBlock(null);
        onSuccess?.(targetId, blockType);
      },
      onError: (error) => {
        setIsBlocking(false);
        setPendingBlock(null);
        onError?.(targetId, error);
      },
      onRollback: () => {
        setIsBlocking(false);
        setPendingBlock(null);
      },
    });
  }, [pendingBlock, enqueue, blockUserMutation, blockPostMutation, onSuccess, onError]);

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
