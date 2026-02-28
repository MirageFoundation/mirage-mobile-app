/**
 * useBlockHandler Hook
 *
 * Provides block functionality with confirmation popup and POW queue integration.
 */

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBlockUser, useBlockPost, useBlockTopic } from "@/src/api/write";
import { queryKeys } from "@/src/api/read/query-keys";
import type { UserBlockedResponse } from "@/src/api/types";
import {
  usePowQueueStore,
  generateActionId,
} from "@/src/services/pow-queue";
import { useAuthGuard } from "./use-auth-guard";
import { useAuthStore } from "@/src/stores";

export type BlockType = "user" | "post" | "comment" | "topic";

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
  requestBlockTopic: (topic: string) => void;
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
  const enqueue = usePowQueueStore((state) => state.enqueue);
  const queryClient = useQueryClient();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<BlockTarget | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);

  const blockUserMutation = useBlockUser();
  const blockPostMutation = useBlockPost();
  const blockTopicMutation = useBlockTopic();

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

  const requestBlockTopic = useCallback(
    (topic: string) => {
      requireAuth(() => {
        setPendingBlock({
          id: topic,
          type: "topic",
          label: `#${topic}`,
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

  const optimisticallyAddToBlockedList = useCallback(
    (blockType: BlockType, targetId: string) => {
      if (!walletAddress) return undefined;
      const qk = queryKeys.userBlocked(walletAddress);
      const prev = queryClient.getQueryData<UserBlockedResponse>(qk);
      const current: UserBlockedResponse = prev ?? {
        blocked_users: [],
        blocked_posts: [],
        blocked_topics: [],
      };
      const updated = { ...current };
      if (blockType === "user") {
        if (!current.blocked_users.includes(targetId)) {
          updated.blocked_users = [...current.blocked_users, targetId];
        }
      } else if (blockType === "topic") {
        const topics = current.blocked_topics ?? [];
        if (!topics.includes(targetId)) {
          updated.blocked_topics = [...topics, targetId];
        }
      } else {
        if (!current.blocked_posts.includes(targetId)) {
          updated.blocked_posts = [...current.blocked_posts, targetId];
        }
      }
      queryClient.setQueryData(qk, updated);
      return prev;
    },
    [walletAddress, queryClient],
  );

  const confirmBlock = useCallback(() => {
    if (!pendingBlock) return;

    const { id: targetId, type: blockType, label } = pendingBlock;

    setShowConfirmation(false);
    setIsBlocking(true);

    const actionId = generateActionId();
    const actionLabel = `Blocking ${label || "content"}`;

    const previousData = optimisticallyAddToBlockedList(blockType, targetId);

    enqueue({
      id: actionId,
      type: "block",
      label: actionLabel,
      execute: async () => {
        const qk = walletAddress ? queryKeys.userBlocked(walletAddress) : null;
        if (qk) {
          await queryClient.cancelQueries({ queryKey: qk });
        }
        let result;
        if (blockType === "user") {
          result = await blockUserMutation.mutateAsync(targetId);
        } else if (blockType === "topic") {
          result = await blockTopicMutation.mutateAsync(targetId);
        } else {
          result = await blockPostMutation.mutateAsync(targetId);
        }
        if (qk) {
          await queryClient.cancelQueries({ queryKey: qk });
          optimisticallyAddToBlockedList(blockType, targetId);
        }
        return result;
      },
      onSuccess: () => {
        setIsBlocking(false);
        setPendingBlock(null);
        onSuccess?.(targetId, blockType);
      },
      onError: (error) => {
        setIsBlocking(false);
        setPendingBlock(null);
        if (previousData !== undefined && walletAddress) {
          queryClient.setQueryData(queryKeys.userBlocked(walletAddress), previousData);
        }
        onError?.(targetId, error);
      },
      onRollback: () => {
        setIsBlocking(false);
        setPendingBlock(null);
        if (previousData !== undefined && walletAddress) {
          queryClient.setQueryData(queryKeys.userBlocked(walletAddress), previousData);
        }
      },
    });
  }, [pendingBlock, enqueue, blockUserMutation, blockPostMutation, blockTopicMutation, onSuccess, onError, optimisticallyAddToBlockedList, walletAddress, queryClient]);

  return {
    requestBlockUser,
    requestBlockPost,
    requestBlockComment,
    requestBlockTopic,
    confirmBlock,
    cancelBlock,
    isBlocking,
    showConfirmation,
    pendingBlock,
  };
}
