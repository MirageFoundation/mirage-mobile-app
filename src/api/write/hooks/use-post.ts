/**
 * Post & Comment Mutation Hooks
 */

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import type {
  CommentsResponse,
  PostFilters,
  PostWithChildren,
  PostsResponse,
  Post as ApiPost,
} from "@/src/api/types";
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
import * as Sentry from "@sentry/react-native";
import type { PostDraft } from "@/src/stores/draft-store";
import { useHomePostCardStore } from "@/src/pages/home/home-post-card-store";

// ============================================
// Types
// ============================================

export interface UsePostOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export type CreatePostMutationInput = CreatePostInput & {
  optimisticId?: string;
  optimisticActionId?: string;
  optimisticMediaUrl?: string | null;
  optimisticMediaUrls?: string[];
  optimisticPreviewMediaUrls?: string[];
  optimisticDraft?: PostDraft;
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

export const buildOptimisticPost = (
  txHash: string | undefined,
  input: CreatePostMutationInput,
  address: string | null,
  username: string | null | undefined,
  status: ApiPost["optimistic_status"] = "success",
): ApiPost => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fallbackMediaUrl = getFirstMediaUrl(input.content);
  const mediaUrl =
    input.optimisticMediaUrl?.trim() || fallbackMediaUrl || null;
  const postId = txHash ?? input.optimisticId ?? `local-${Date.now()}`;
  const shouldUsePreviewMedia =
    (status === "pending" || status === "success") &&
    !!input.optimisticPreviewMediaUrls?.length;
  const media = shouldUsePreviewMedia
    ? input.optimisticPreviewMediaUrls
    : input.optimisticMediaUrls ?? (mediaUrl ? [mediaUrl] : []);
  const thumbnail = shouldUsePreviewMedia
    ? input.optimisticPreviewMediaUrls?.[0] ?? mediaUrl ?? ""
    : mediaUrl ?? "";

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
    thumbnail,
    media,
    points: 0,
    comments: 0,
    user_vote: 1,
    user_weight: 0,
    optimistic_status: status,
    optimistic_action_id: input.optimisticActionId,
    optimistic_draft: input.optimisticDraft,
    optimistic_video_preview_until: input.optimisticPreviewMediaUrls?.length
      ? Date.now() + 45000
      : undefined,
  };
};

export const upsertHomePost = (queryClient: QueryClient, optimisticPost: ApiPost) => {
  const postQueries = queryClient.getQueriesData({ queryKey: ["posts"] });
  postQueries.forEach(([queryKey, queryData]) => {
    if (!queryData) return;
    const filters = queryKey[1] as PostFilters | undefined;
    if (filters?.feed !== "home") return;

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
};

export const removeOptimisticPostFromCache = (queryClient: QueryClient, postId: string) => {
  updateQueriesWithReducer(queryClient, ["posts"], (data) => removePostFromPostsData(data, postId));
};

export const markOptimisticPostError = (
  queryClient: QueryClient,
  postId: string,
  errorMessage: string,
) => {
  updateQueriesWithReducer(queryClient, ["posts"], (data) => {
    if (!data) return { nextData: data, didUpdate: false };
    const markError = (post: ApiPost) =>
      post.post_id === postId
        ? { ...post, optimistic_status: "error" as const, optimistic_error: errorMessage }
        : post;
    if (isInfinitePostsData(data)) {
      let didUpdate = false;
      const pages = data.pages.map((page) => {
        const posts = page.posts.map((post) => {
          if (post.post_id !== postId) return post;
          didUpdate = true;
          return markError(post);
        });
        return didUpdate ? { ...page, posts } : page;
      });
      return { nextData: didUpdate ? { ...data, pages } : data, didUpdate };
    }
    const singleData = data as PostsResponse;
    let didUpdate = false;
    const posts = singleData.posts.map((post) => {
      if (post.post_id !== postId) return post;
      didUpdate = true;
      return markError(post);
    });
    return { nextData: didUpdate ? { ...singleData, posts } : data, didUpdate };
  });
};

const replaceOrUpdateOptimisticPost = (
  queryClient: QueryClient,
  optimisticId: string,
  nextPost: ApiPost,
) => {
  const nextPostId = nextPost.post_id;
  updateQueriesWithReducer(queryClient, ["posts"], (data) => {
    if (!data) return { nextData: data, didUpdate: false };
    const replace = (post: ApiPost) =>
      post.post_id === optimisticId ? nextPost : post;
    if (isInfinitePostsData(data)) {
      let didUpdate = false;
      const pages = data.pages.map((page) => {
        const posts = page.posts.map((post) => {
          if (post.post_id !== optimisticId) return post;
          didUpdate = true;
          return replace(post);
        });
        return didUpdate ? { ...page, posts } : page;
      });
      return { nextData: didUpdate ? { ...data, pages } : data, didUpdate };
    }
    const singleData = data as PostsResponse;
    let didUpdate = false;
    const posts = singleData.posts.map((post) => {
      if (post.post_id !== optimisticId) return post;
      didUpdate = true;
      return replace(post);
    });
    return { nextData: didUpdate ? { ...singleData, posts } : data, didUpdate };
  });

  useHomePostCardStore.setState((state) => {
    const replaceId = (id: string | null | undefined) =>
      id === optimisticId ? nextPostId : id ?? null;
    const replaceSet = (ids?: Set<string>) => {
      if (!ids?.has(optimisticId)) return ids;
      const next = new Set(ids);
      next.delete(optimisticId);
      next.add(nextPostId);
      return next;
    };

    const activeVideoPostIds = Object.fromEntries(
      Object.entries(state.activeVideoPostIds).map(([screen, id]) => [screen, replaceId(id)]),
    );
    const visibleVideoPostIds = Object.fromEntries(
      Object.entries(state.visibleVideoPostIds).map(([screen, ids]) => [screen, replaceSet(ids) ?? ids]),
    );
    const nearbyVideoPostIds = Object.fromEntries(
      Object.entries(state.nearbyVideoPostIds).map(([screen, ids]) => [screen, replaceSet(ids) ?? ids]),
    );

    return {
      activeVideoPostIds,
      visibleVideoPostIds,
      nearbyVideoPostIds,
    };
  });
};

const preserveLocalPreviewMedia = (
  queryClient: QueryClient,
  postId: string,
  previewMediaUrls: string[],
) => {
  if (!previewMediaUrls.length) return;
  updateQueriesWithReducer(queryClient, ["posts"], (data) => {
    if (!data) return { nextData: data, didUpdate: false };
    const preserve = (post: ApiPost) =>
      post.post_id === postId
        ? {
            ...post,
            thumbnail: previewMediaUrls[0] ?? post.thumbnail,
            media: previewMediaUrls,
            optimistic_video_preview_until: Date.now() + 45000,
          }
        : post;
    if (isInfinitePostsData(data)) {
      let didUpdate = false;
      const pages = data.pages.map((page) => {
        const posts = page.posts.map((post) => {
          if (post.post_id !== postId) return post;
          didUpdate = true;
          return preserve(post);
        });
        return didUpdate ? { ...page, posts } : page;
      });
      return { nextData: didUpdate ? { ...data, pages } : data, didUpdate };
    }
    const singleData = data as PostsResponse;
    let didUpdate = false;
    const posts = singleData.posts.map((post) => {
      if (post.post_id !== postId) return post;
      didUpdate = true;
      return preserve(post);
    });
    return { nextData: didUpdate ? { ...singleData, posts } : data, didUpdate };
  });
};

const buildOptimisticComment = (
  commentId: string,
  input: CreateCommentInput,
  address: string | null,
  username: string | null | undefined,
  rootPost: PostWithChildren,
): PostWithChildren => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return {
    post_id: commentId,
    user_id: address ?? "unknown",
    username: username ?? address ?? "you",
    timestamp: nowSeconds,
    topic: "",
    root_topic: rootPost.root_topic,
    root_post_id: rootPost.root_post_id || rootPost.post_id,
    title: input.title ?? "",
    content: input.content,
    tag: input.tag ?? "",
    edited_at: 0,
    thumbnail: "",
    media: input.media ?? [],
    points: 1,
    comments: 0,
    user_vote: 1,
    user_weight: 0,
    children: [],
  };
};

const isInfinitePostsData = (
  data: unknown,
): data is { pages: PostsResponse[]; pageParams: unknown[] } => {
  return (
    typeof data === "object" &&
    data !== null &&
    "pages" in data &&
    Array.isArray((data as { pages?: unknown }).pages)
  );
};

const commentTreeContainsId = (
  comments: PostWithChildren[],
  targetId: string,
): boolean => {
  return comments.some(
    (comment) =>
      comment.post_id === targetId ||
      commentTreeContainsId(comment.children ?? [], targetId),
  );
};

const insertReplyIntoTree = (
  comments: PostWithChildren[],
  parentId: string,
  reply: PostWithChildren,
): PostWithChildren[] => {
  let didUpdate = false;

  const nextComments = comments.map((comment) => {
    if (comment.post_id === parentId) {
      didUpdate = true;
      return {
        ...comment,
        children: [...(comment.children ?? []), reply],
      };
    }

    if (!comment.children || comment.children.length === 0) {
      return comment;
    }

    const updatedChildren = insertReplyIntoTree(comment.children, parentId, reply);
    if (updatedChildren !== comment.children) {
      didUpdate = true;
      return {
        ...comment,
        children: updatedChildren,
      };
    }

    return comment;
  });

  return didUpdate ? nextComments : comments;
};

const replaceCommentIdInTree = (
  comments: PostWithChildren[],
  oldId: string,
  newId: string,
): PostWithChildren[] => {
  let didUpdate = false;

  const nextComments = comments.map((comment) => {
    const nextCommentId = comment.post_id === oldId ? newId : comment.post_id;
    if (nextCommentId !== comment.post_id) {
      didUpdate = true;
    }

    let nextChildren = comment.children;
    if (comment.children && comment.children.length > 0) {
      const updatedChildren = replaceCommentIdInTree(comment.children, oldId, newId);
      if (updatedChildren !== comment.children) {
        didUpdate = true;
        nextChildren = updatedChildren;
      }
    }

    if (nextCommentId !== comment.post_id || nextChildren !== comment.children) {
      return {
        ...comment,
        post_id: nextCommentId,
        children: nextChildren,
      };
    }

    return comment;
  });

  return didUpdate ? nextComments : comments;
};

const removeCommentFromTree = (
  comments: PostWithChildren[],
  targetId: string,
): { nextComments: PostWithChildren[]; removed: boolean } => {
  let removed = false;

  const nextComments = comments
    .filter((comment) => {
      if (comment.post_id === targetId) {
        removed = true;
        return false;
      }
      return true;
    })
    .map((comment) => {
      if (!comment.children || comment.children.length === 0) {
        return comment;
      }

      const nextChildrenResult = removeCommentFromTree(comment.children, targetId);
      if (nextChildrenResult.removed) {
        removed = true;
        return {
          ...comment,
          children: nextChildrenResult.nextComments,
        };
      }

      return comment;
    });

  return {
    nextComments: removed ? nextComments : comments,
    removed,
  };
};

const applyCommentDeltaToPostsData = (
  data: unknown,
  postId: string,
  delta: number,
): { nextData: unknown; didUpdate: boolean } => {
  if (!data) {
    return { nextData: data, didUpdate: false };
  }

  if (isInfinitePostsData(data)) {
    let didUpdate = false;
    const nextPages = data.pages.map((page) => {
      let didUpdatePage = false;
      const nextPosts = page.posts.map((post) => {
        if (post.post_id !== postId) return post;
        didUpdatePage = true;
        return {
          ...post,
          comments: Math.max(0, (post.comments ?? 0) + delta),
        };
      });

      if (!didUpdatePage) {
        return page;
      }

      didUpdate = true;
      return {
        ...page,
        posts: nextPosts,
      };
    });

    return {
      nextData: didUpdate ? { ...data, pages: nextPages } : data,
      didUpdate,
    };
  }

  const singleData = data as PostsResponse;
  let didUpdate = false;
  const nextPosts = singleData.posts.map((post) => {
    if (post.post_id !== postId) return post;
    didUpdate = true;
    return {
      ...post,
      comments: Math.max(0, (post.comments ?? 0) + delta),
    };
  });

  return {
    nextData: didUpdate ? { ...singleData, posts: nextPosts } : data,
    didUpdate,
  };
};

const removePostFromPostsData = (
  data: unknown,
  postId: string,
): { nextData: unknown; didUpdate: boolean } => {
  if (!data) {
    return { nextData: data, didUpdate: false };
  }

  if (isInfinitePostsData(data)) {
    let didUpdate = false;
    const nextPages = data.pages.map((page) => {
      const nextPosts = page.posts.filter((post) => post.post_id !== postId);
      if (nextPosts.length === page.posts.length) {
        return page;
      }

      didUpdate = true;
      return {
        ...page,
        posts: nextPosts,
        total: Math.max(0, page.total - 1),
      };
    });

    return {
      nextData: didUpdate ? { ...data, pages: nextPages } : data,
      didUpdate,
    };
  }

  const singleData = data as PostsResponse;
  const nextPosts = singleData.posts.filter((post) => post.post_id !== postId);
  if (nextPosts.length === singleData.posts.length) {
    return { nextData: data, didUpdate: false };
  }

  return {
    nextData: {
      ...singleData,
      posts: nextPosts,
      total: Math.max(0, singleData.total - 1),
    },
    didUpdate: true,
  };
};

const updateQueriesWithReducer = (
  queryClient: QueryClient,
  queryKeyPrefix: QueryKey,
  reducer: (data: unknown) => { nextData: unknown; didUpdate: boolean },
) => {
  const matchingQueries = queryClient.getQueriesData({ queryKey: queryKeyPrefix });

  matchingQueries.forEach(([queryKey, queryData]) => {
    const { nextData, didUpdate } = reducer(queryData);
    if (didUpdate) {
      queryClient.setQueryData(queryKey, nextData);
    }
  });
};

const restoreQuerySnapshots = (
  queryClient: QueryClient,
  snapshots: Array<[QueryKey, unknown]> | undefined,
) => {
  snapshots?.forEach(([queryKey, queryData]) => {
    queryClient.setQueryData(queryKey, queryData);
  });
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTargetNotFoundError = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.toLowerCase().includes("target not found");
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
      const { optimisticId, optimisticActionId, optimisticMediaUrl, optimisticMediaUrls, optimisticPreviewMediaUrls, optimisticDraft, ...postInput } = input;
      return createPost(wallet, postInput, options.onPoWProgress);
    },
    onSuccess: (data, input) => {
      Sentry.addBreadcrumb({
        category: "create-post",
        message: "Create post mutation succeeded",
        level: "info",
        data: {
          txHash: data?.tx_hash,
          optimisticId: input.optimisticId,
          optimisticActionId: input.optimisticActionId,
          mediaCount: input.media?.length ?? 0,
          hasPreviewMedia: !!input.optimisticPreviewMediaUrls?.length,
        },
      });
      const optimisticPost = buildOptimisticPost(
        data?.tx_hash,
        input,
        address,
        username,
      );

      if (input.optimisticId) {
        Sentry.addBreadcrumb({
          category: "create-post",
          message: "Replacing optimistic post with confirmed post",
          level: "info",
          data: {
            optimisticId: input.optimisticId,
            confirmedPostId: optimisticPost.post_id,
            hasPreviewMedia: !!input.optimisticPreviewMediaUrls?.length,
          },
        });
        replaceOrUpdateOptimisticPost(queryClient, input.optimisticId, optimisticPost);
        if (input.optimisticPreviewMediaUrls?.length) {
          Sentry.addBreadcrumb({
            category: "create-post",
            message: "Preserving local media preview after post success",
            level: "info",
            data: {
              postId: optimisticPost.post_id,
              previewCount: input.optimisticPreviewMediaUrls.length,
            },
          });
          preserveLocalPreviewMedia(queryClient, optimisticPost.post_id, input.optimisticPreviewMediaUrls);
          [1000, 2500, 5000, 10000, 20000, 45000].forEach((delay) => {
            setTimeout(() => {
              preserveLocalPreviewMedia(queryClient, optimisticPost.post_id, input.optimisticPreviewMediaUrls ?? []);
            }, delay);
          });
        }
        setTimeout(() => {
          if (input.optimisticPreviewMediaUrls?.length) {
            useHomePostCardStore.setState((state) => {
              const screen = state.activeFeedScreen;
              if (!screen) return state;
              const visible = new Set(state.visibleVideoPostIds[screen] ?? []);
              const nearby = new Set(state.nearbyVideoPostIds[screen] ?? []);
              visible.add(optimisticPost.post_id);
              nearby.add(optimisticPost.post_id);
              return {
                activeVideoPostIds: {
                  ...state.activeVideoPostIds,
                  [screen]: optimisticPost.post_id,
                },
                visibleVideoPostIds: {
                  ...state.visibleVideoPostIds,
                  [screen]: visible,
                },
                nearbyVideoPostIds: {
                  ...state.nearbyVideoPostIds,
                  [screen]: nearby,
                },
              };
            });
          }
          updateQueriesWithReducer(queryClient, ["posts"], (queryData) => {
            if (!queryData) return { nextData: queryData, didUpdate: false };
            const clearStatus = (post: ApiPost) =>
              post.post_id === optimisticPost.post_id
                ? {
                    ...post,
                    optimistic_status: undefined,
                    optimistic_error: undefined,
                    optimistic_draft: undefined,
                    optimistic_video_preview_until: input.optimisticPreviewMediaUrls?.length
                      ? Date.now() + 45000
                      : post.optimistic_video_preview_until,
                  }
                : post;
            if (isInfinitePostsData(queryData)) {
              let didUpdate = false;
              const pages = queryData.pages.map((page) => {
                const posts = page.posts.map((post) => {
                  if (post.post_id !== optimisticPost.post_id) return post;
                  didUpdate = true;
                  return clearStatus(post);
                });
                return didUpdate ? { ...page, posts } : page;
              });
              return { nextData: didUpdate ? { ...queryData, pages } : queryData, didUpdate };
            }
            const singleData = queryData as PostsResponse;
            let didUpdate = false;
            const posts = singleData.posts.map((post) => {
              if (post.post_id !== optimisticPost.post_id) return post;
              didUpdate = true;
              return clearStatus(post);
            });
            return { nextData: didUpdate ? { ...singleData, posts } : queryData, didUpdate };
          });
        }, 2000);
      } else {
        upsertHomePost(queryClient, optimisticPost);
      }

      // Keep the newly created post visible immediately in Home feeds.
      // Magic is reconciled back to backend ordering on refresh / new-posts reload.
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
  const username = useAuthStore((s) => s.user?.username);

  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const wallet = await getWallet();
      return createComment(wallet, input, options.onPoWProgress);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["comments"] });

      const previousComments = queryClient.getQueriesData<CommentsResponse>({
        queryKey: ["comments"],
      }) as Array<[QueryKey, CommentsResponse | undefined]>;

      const optimisticCommentId = `optimistic-${Date.now()}`;

      previousComments.forEach(([queryKey, queryData]) => {
        if (!queryData?.root) return;

        const isTopLevelComment = queryData.root.post_id === input.parentId;
        const isReplyToNestedComment = commentTreeContainsId(
          queryData.children,
          input.parentId,
        );

        if (!isTopLevelComment && !isReplyToNestedComment) return;

        queryClient.setQueryData<CommentsResponse>(queryKey, {
          ...queryData,
          root: {
            ...queryData.root,
            comments: (queryData.root.comments ?? 0) + 1,
          },
        });
      });

      return {
        previousComments,
        optimisticCommentId,
      };
    },
    onError: (_error, _input, context) => {
      Sentry.captureException(_error, {
        tags: { feature: "posts", operation: "comment" },
        extra: { parentId: _input.parentId },
      });
      restoreQuerySnapshots(queryClient, context?.previousComments);
    },
    onSuccess: () => {},
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["comments"],
        refetchType: "active",
      });
      queryClient.invalidateQueries({
        queryKey: ["posts"],
        refetchType: "active",
      });

      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
          refetchType: "active",
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["posts"] });
      await queryClient.cancelQueries({ queryKey: ["comments"] });
      if (address) {
        await queryClient.cancelQueries({ queryKey: queryKeys.userPosts(address) });
      }

      const previousPosts = queryClient.getQueriesData({ queryKey: ["posts"] }) as Array<[QueryKey, unknown]>;
      const previousUserPosts = queryClient.getQueriesData({ queryKey: ["user", "posts"] }) as Array<[QueryKey, unknown]>;
      const previousComments = queryClient.getQueriesData({ queryKey: ["comments"] }) as Array<[QueryKey, unknown]>;

      const nowSeconds = Math.floor(Date.now() / 1000);

      const updatePost = (post: ApiPost): ApiPost => {
        if (post.post_id !== input.postId) return post;
        return {
          ...post,
          title: input.title,
          content: input.content,
          tag: input.tag ?? post.tag,
          topic: input.topic ?? post.topic,
          media: input.media ?? post.media,
          edited_at: nowSeconds,
        };
      };

      const applyToPostsData = (data: unknown): { nextData: unknown; didUpdate: boolean } => {
        if (!data) return { nextData: data, didUpdate: false };
        if (isInfinitePostsData(data)) {
          let didUpdate = false;
          const nextPages = data.pages.map((page) => {
            const nextPosts = page.posts.map((p) => {
              const updated = updatePost(p);
              if (updated !== p) didUpdate = true;
              return updated;
            });
            return { ...page, posts: nextPosts };
          });
          return { nextData: didUpdate ? { ...data, pages: nextPages } : data, didUpdate };
        }
        const singleData = data as PostsResponse;
        let didUpdate = false;
        const nextPosts = singleData.posts.map((p) => {
          const updated = updatePost(p);
          if (updated !== p) didUpdate = true;
          return updated;
        });
        return { nextData: didUpdate ? { ...singleData, posts: nextPosts } : data, didUpdate };
      };

      updateQueriesWithReducer(queryClient, ["posts"], applyToPostsData);
      updateQueriesWithReducer(queryClient, ["user", "posts"], applyToPostsData);

      const commentsQueries = queryClient.getQueriesData<CommentsResponse>({ queryKey: ["comments"] });
      commentsQueries.forEach(([queryKey, queryData]) => {
        if (!queryData?.root || queryData.root.post_id !== input.postId) return;
        queryClient.setQueryData<CommentsResponse>(queryKey, {
          ...queryData,
          root: {
            ...queryData.root,
            title: input.title,
            content: input.content,
            tag: input.tag ?? queryData.root.tag,
            topic: input.topic ?? queryData.root.topic,
            media: input.media ?? queryData.root.media,
            edited_at: nowSeconds,
          },
        });
      });

      return { previousPosts, previousUserPosts, previousComments };
    },
    onError: (_error, _input, context) => {
      Sentry.captureException(_error, {
        tags: { feature: "posts", operation: "edit" },
        extra: { postId: _input.postId },
      });
      restoreQuerySnapshots(queryClient, context?.previousPosts);
      restoreQuerySnapshots(queryClient, context?.previousUserPosts);
      restoreQuerySnapshots(queryClient, context?.previousComments);
    },
    onSettled: () => {
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
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await deletePost(wallet, input, options.onPoWProgress);
        } catch (error) {
          const shouldRetry =
            isTargetNotFoundError(error) && attempt < maxAttempts;

          if (!shouldRetry) {
            throw error;
          }

          await wait(1200 * attempt);
        }
      }

      throw new Error("Delete failed");
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["comments"] });
      await queryClient.cancelQueries({ queryKey: ["posts"] });
      await queryClient.cancelQueries({ queryKey: ["user", "posts"] });

      const previousComments = queryClient.getQueriesData<CommentsResponse>({
        queryKey: ["comments"],
      }) as Array<[QueryKey, CommentsResponse | undefined]>;
      const previousPosts = queryClient.getQueriesData({ queryKey: ["posts"] }) as Array<
        [QueryKey, unknown]
      >;
      const previousUserPosts = queryClient.getQueriesData({
        queryKey: ["user", "posts"],
      }) as Array<[QueryKey, unknown]>;

      previousComments.forEach(([queryKey, queryData]) => {
        if (!queryData?.root || queryData.root.post_id === input.postId) {
          return;
        }

        const removalResult = removeCommentFromTree(queryData.children, input.postId);
        if (!removalResult.removed) {
          return;
        }

        queryClient.setQueryData<CommentsResponse>(queryKey, {
          ...queryData,
          root: {
            ...queryData.root,
            comments: Math.max(0, (queryData.root.comments ?? 0) - 1),
          },
          children: removalResult.nextComments,
        });
      });

      updateQueriesWithReducer(queryClient, ["posts"], (queryData) =>
        removePostFromPostsData(queryData, input.postId),
      );
      updateQueriesWithReducer(queryClient, ["user", "posts"], (queryData) =>
        removePostFromPostsData(queryData, input.postId),
      );

      return {
        previousComments,
        previousPosts,
        previousUserPosts,
      };
    },
    onError: (_error, _input, context) => {
      Sentry.captureException(_error, {
        tags: { feature: "posts", operation: "delete" },
        extra: { postId: _input.postId },
      });
      restoreQuerySnapshots(queryClient, context?.previousComments);
      restoreQuerySnapshots(queryClient, context?.previousPosts);
      restoreQuerySnapshots(queryClient, context?.previousUserPosts);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"], refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: ["comments"], refetchType: "inactive" });

      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPosts(address),
          refetchType: "inactive",
        });
      }
    },
  });
}
