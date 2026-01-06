/**
 * Post & Comment Mutation Hooks
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useTxStatusPolling } from "@/src/api/read/hooks/use-tx-status";
import {
  createPost,
  createComment,
  editPost,
  deletePost,
  type CreatePostInput,
  type CreateCommentInput,
  type EditPostInput,
  type DeletePostInput,
} from "../endpoints/posts";
import type { PoWProgress } from "../signing";

// ============================================
// Types
// ============================================

export interface UsePostOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

// ============================================
// usePost - Create new posts
// ============================================

export function usePost(options: UsePostOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (input: CreatePostInput) => {
      const wallet = await getWallet();
      return createPost(wallet, input, options.onPoWProgress);
    },
    onSuccess: () => {
      // Invalidate posts list
      queryClient.invalidateQueries({ queryKey: ["posts"] });

      // Invalidate user posts
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
        });
      }
    },
  });
}

/**
 * usePost with transaction confirmation
 */
export function usePostWithConfirmation(options: UsePostOptions = {}) {
  const postMutation = usePost(options);
  const [txHash, setTxHash] = useState<string | null>(null);
  const txStatus = useTxStatusPolling(txHash);

  const submitPost = async (input: CreatePostInput) => {
    const result = await postMutation.mutateAsync(input);
    setTxHash(result.tx_hash);
    return result;
  };

  return {
    submit: submitPost,
    isPending: postMutation.isPending,
    isSuccess: postMutation.isSuccess,
    isError: postMutation.isError,
    error: postMutation.error || txStatus.error,
    txHash,
    txStatus: txStatus.data,
    isConfirmed: txStatus.data?.found && txStatus.data?.indexed,
    reset: () => {
      setTxHash(null);
      postMutation.reset();
    },
  };
}

// ============================================
// useComment - Create comments
// ============================================

export function useComment(options: UsePostOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const wallet = await getWallet();
      return createComment(wallet, input, options.onPoWProgress);
    },
    onSuccess: (data, { parentId }) => {
      // Invalidate comments for the post
      queryClient.invalidateQueries({ queryKey: ["comments"] });

      // Also invalidate posts to update comment count
      queryClient.invalidateQueries({ queryKey: ["posts"] });

      // Invalidate user posts
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
        });
      }
    },
  });
}

/**
 * useComment with transaction confirmation
 */
export function useCommentWithConfirmation(options: UsePostOptions = {}) {
  const commentMutation = useComment(options);
  const [txHash, setTxHash] = useState<string | null>(null);
  const txStatus = useTxStatusPolling(txHash);

  const submitComment = async (input: CreateCommentInput) => {
    const result = await commentMutation.mutateAsync(input);
    setTxHash(result.tx_hash);
    return result;
  };

  return {
    submit: submitComment,
    isPending: commentMutation.isPending,
    isSuccess: commentMutation.isSuccess,
    isError: commentMutation.isError,
    error: commentMutation.error || txStatus.error,
    txHash,
    txStatus: txStatus.data,
    isConfirmed: txStatus.data?.found && txStatus.data?.indexed,
    reset: () => {
      setTxHash(null);
      commentMutation.reset();
    },
  };
}

// ============================================
// useEdit - Edit posts/comments
// ============================================

export function useEdit(options: UsePostOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (input: EditPostInput) => {
      const wallet = await getWallet();
      return editPost(wallet, input, options.onPoWProgress);
    },
    onSuccess: () => {
      // Invalidate all post/comment caches
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });

      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
        });
      }
    },
  });
}

// ============================================
// useDelete - Delete posts/comments
// ============================================

export function useDelete(options: UsePostOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (input: DeletePostInput) => {
      const wallet = await getWallet();
      return deletePost(wallet, input, options.onPoWProgress);
    },
    onSuccess: () => {
      // Invalidate all post/comment caches
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });

      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
        });
      }
    },
  });
}
