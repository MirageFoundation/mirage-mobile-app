/**
 * Post & Comment Mutation Hooks
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import type { PostFilters, PostsResponse, Post as ApiPost } from "@/src/api/types";
import { useAuthStore } from "@/src/stores";
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

export type CreatePostMutationInput = CreatePostInput & {
  optimisticMediaUrl?: string | null;
};

const MEDIA_URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "mpeg",
  "mpg",
  "m3u8",
  "mpd",
]);

const getFirstMediaUrl = (content: string): string | null => {
  const matches = content.match(MEDIA_URL_REGEX);
  if (!matches) return null;

  for (const url of matches) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname.includes("videodelivery.net")) {
        return url;
      }
      const path = parsedUrl.pathname.toLowerCase();
      const extension = path.split(".").pop() ?? "";
      if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) {
        return url;
      }
    } catch {
      const path = url.toLowerCase().split("?")[0];
      const extension = path.split(".").pop() ?? "";
      if (url.includes("videodelivery.net")) return url;
      if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) {
        return url;
      }
    }
  }

  return null;
};

const buildOptimisticPost = (
  txHash: string | undefined,
  input: CreatePostMutationInput,
  address: string | null,
  username: string | null | undefined,
): ApiPost => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fallbackMediaUrl = getFirstMediaUrl(input.content);
  const mediaUrl =
    input.optimisticMediaUrl?.trim() || fallbackMediaUrl || null;
  const postId = txHash ?? `local-${Date.now()}`;

  return {
    post_id: postId,
    user_id: address ?? "unknown",
    username: username ?? address ?? "you",
    timestamp: nowSeconds,
    topic: input.topic,
    root_topic: input.topic,
    root_post_id: postId,
    title: input.title,
    content: input.content,
    tag: input.tag ?? "",
    edited_at: 0,
    thumbnail: mediaUrl ?? "",
    points: 0,
    comments: 0,
    user_vote: 1,
    user_weight: 0,
  };
};

// ============================================
// usePost - Create new posts
// ============================================

export function usePost(options: UsePostOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();
  const username = useAuthStore((s) => s.user?.username);

  return useMutation({
    mutationFn: async (input: CreatePostMutationInput) => {
      const wallet = await getWallet();
      const { optimisticMediaUrl, ...postInput } = input;
      return createPost(wallet, postInput, options.onPoWProgress);
    },
    onSuccess: (data, input) => {
      const optimisticPost = buildOptimisticPost(
        data?.tx_hash,
        input,
        address,
        username,
      );

      const postQueries = queryClient.getQueriesData({ queryKey: ["posts"] });
      postQueries.forEach(([queryKey, queryData]) => {
        if (!queryData) return;
        const filters = queryKey[1] as PostFilters | undefined;
        if (filters?.feed && filters.feed !== "home") return;

        if (
          typeof queryData === "object" &&
          queryData !== null &&
          "pages" in queryData
        ) {
          const dataWithPages = queryData as {
            pages: PostsResponse[];
            pageParams: unknown[];
          };
          const [firstPage, ...rest] = dataWithPages.pages;
          if (!firstPage) return;
          if (firstPage.posts.some((post) => post.post_id === optimisticPost.post_id)) {
            return;
          }

          queryClient.setQueryData(queryKey, {
            ...dataWithPages,
            pages: [
              {
                ...firstPage,
                posts: [optimisticPost, ...firstPage.posts],
                total: firstPage.total + 1,
              },
              ...rest,
            ],
          });
        } else {
          const dataSingle = queryData as PostsResponse;
          if (dataSingle.posts.some((post) => post.post_id === optimisticPost.post_id)) {
            return;
          }
          queryClient.setQueryData(queryKey, {
            ...dataSingle,
            posts: [optimisticPost, ...dataSingle.posts],
            total: dataSingle.total + 1,
          });
        }
      });

      // Mark posts as stale without refetching active feeds.
      queryClient.invalidateQueries({
        queryKey: ["posts"],
        refetchType: "inactive",
      });

     // Invalidate user posts
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
          refetchType: "inactive",
        });
      }

      // Invalidate topics cache to include newly created topics
      queryClient.invalidateQueries({
        queryKey: ["topics"],
        refetchType: "inactive",
      });
      queryClient.invalidateQueries({
        queryKey: ["searchTopics"],
        refetchType: "inactive",
      });
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

  const submitPost = async (input: CreatePostMutationInput) => {
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
      // Mark comments as stale without refetching active feeds
      // This prevents the optimistic update from being overwritten by stale server data
      queryClient.invalidateQueries({
        queryKey: ["comments"],
        refetchType: "inactive",
      });

      // Also invalidate posts to update comment count
      queryClient.invalidateQueries({
        queryKey: ["posts"],
        refetchType: "inactive",
      });

      // Invalidate user posts
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
          refetchType: "inactive",
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
