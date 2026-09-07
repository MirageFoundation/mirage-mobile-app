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
import { getPostsFiltersFromKey, queryKeys } from "@/src/api/read/query-keys";
import { getPosts } from "@/src/api/read/endpoints/posts";
import { withSessionLensPicks } from "@/src/api/read/request-params";

import { removePostAliasesFromData } from "@/src/api/cache/remove-post-aliases";
import { isPostVideoProcessing } from "@/src/domain/posts/video-processing";
import {
  mergeRefreshedPostPreservingOrder,
  setTransientPostSuccessInData,
} from "@/src/api/cache/transient-post-success";
import type {
  CommentsResponse,
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
import { mutationKeys } from "../mutation-keys";
import { getServerIdentity, StaleServerResponseError } from "@/src/api/server-runtime";
import { assertReplyNotRejected, useReplyRejectionStore } from "@/src/stores/reply-rejection-store";
import { isLegacyThreadReadOnlyError, LegacyThreadReadOnlyError } from "@/src/domain/subscriptions/errors";
import { trackEvent } from "@/src/services/analytics";
import type { PoWProgress } from "../signing";
import * as Sentry from "@sentry/react-native";
import type { PostDraft } from "@/src/stores/draft-store";
import { UNSPECIFIED_SERVED_LENS } from "@/src/domain/communities";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePendingPostsStore } from "@/src/stores/pending-posts-store";
import { getAllowedTagsFromContentTypes, usePreferencesStore } from "@/src/stores/preferences-store";

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
  optimisticMediaMeta?: ApiPost["media_meta"];
  optimisticDraft?: PostDraft;
};

export type EditPostMutationInput = EditPostInput & {
  optimisticActionId?: string;
};

type UpsertHomePostOptions = {
  address?: string;
  allowedTags?: string;
  limit?: number;
};

const TRANSIENT_POST_SUCCESS_MS = 2000;
const transientPostSuccessTimers = new Map<string, ReturnType<typeof setTimeout>>();
const transientPostSuccessExpiresAt = new Map<string, number>();

const isTransientPostSuccessActive = (postId: string) =>
  (transientPostSuccessExpiresAt.get(postId) ?? 0) > Date.now();

const cancelTransientPostSuccess = (postId: string, reportCancellation = true) => {
  const timer = transientPostSuccessTimers.get(postId);
  if (timer) clearTimeout(timer);
  if (reportCancellation && (timer || transientPostSuccessExpiresAt.has(postId))) {
    Sentry.addBreadcrumb({
      category: "create-post",
      message: "Transient post success cancelled",
      level: "info",
      data: { postId, hadTimer: !!timer },
    });
  }
  transientPostSuccessTimers.delete(postId);
  transientPostSuccessExpiresAt.delete(postId);
};

const clearTransientPostSuccess = (queryClient: QueryClient, postId: string) => {
  const wasRegistered = transientPostSuccessExpiresAt.has(postId);
  const expired = !isTransientPostSuccessActive(postId);
  cancelTransientPostSuccess(postId, false);
  queryClient.setQueriesData({ queryKey: queryKeys.postsRoot() }, (data) =>
    setTransientPostSuccessInData(data, postId, false),
  );
  if (wasRegistered) {
    Sentry.addBreadcrumb({
      category: "create-post",
      message: expired ? "Transient post success expired" : "Transient post success cleared",
      level: "info",
      data: { postId },
    });
  }
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
      const path = parsedUrl.pathname.toLowerCase();
      const extension = path.split(".").pop() ?? "";
      if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) {
        return url;
      }
    } catch {
      const path = url.toLowerCase().split("?")[0];
      const extension = path.split(".").pop() ?? "";
      if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) {
        return url;
      }
    }
  }

  return null;
};

const getVideoPreviewMediaUrls = (input: CreatePostMutationInput) =>
  input.optimisticDraft?.attachmentType === "video"
    ? input.optimisticPreviewMediaUrls
    : undefined;

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
  const videoPreviewMediaUrls = getVideoPreviewMediaUrls(input);
  const shouldUsePreviewMedia =
    !!input.optimisticPreviewMediaUrls?.length &&
    status === "pending";
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
    community: input.community,
    root_community: input.community,
    root_post_id: postId,
    title: input.title,
    content: input.content,
    tag: input.tag ?? "",
    edited_at: 0,
    thumbnail,
    media,
    media_meta: input.optimisticMediaMeta,
    points: 1,
    comments: 0,
    user_vote: 1,
    user_weight: 1,
    lens: UNSPECIFIED_SERVED_LENS,
    thread_locked: false,
    protocol_version: 1,
    optimistic_status: status,
    optimistic_action_id: input.optimisticActionId,
    optimistic_draft: input.optimisticDraft,
    optimistic_video_preview_until: videoPreviewMediaUrls?.length
      ? Date.now() + 130000
      : undefined,
  };
};

const upsertPostIntoPostsResponse = (
 queryData: PostsResponse,
 optimisticPost: ApiPost,
): PostsResponse => {
 const matchingPostIndex = queryData.posts.findIndex(
  (post) =>
   post.post_id === optimisticPost.post_id ||
   (!!optimisticPost.optimistic_action_id &&
    post.optimistic_action_id === optimisticPost.optimistic_action_id),
 );

 if (matchingPostIndex === -1) {
  return {
   ...queryData,
   posts: [optimisticPost, ...queryData.posts],
   total: queryData.total + 1,
  };
 }

 const existingPost = queryData.posts[matchingPostIndex];
 const isStaleLocalOptimisticPost =
  optimisticPost.post_id.startsWith("optimistic-post-") &&
  !existingPost.post_id.startsWith("optimistic-post-") &&
  !!optimisticPost.optimistic_action_id &&
  optimisticPost.optimistic_action_id === existingPost.optimistic_action_id;
 if (
  isStaleLocalOptimisticPost ||
  (optimisticPost.optimistic_status === "pending" &&
   existingPost.optimistic_status !== "pending")
 ) {
  return queryData;
 }

 return {
  ...queryData,
  posts: [
   optimisticPost,
   ...queryData.posts.filter((_, index) => index !== matchingPostIndex),
  ],
 };
};

const upsertPostIntoInfinitePostsData = (
 queryData: { pages: PostsResponse[]; pageParams: unknown[] },
 optimisticPost: ApiPost,
) => {
 const [firstPage, ...rest] = queryData.pages;
 if (!firstPage) return queryData;
 const nextFirstPage = upsertPostIntoPostsResponse(firstPage, optimisticPost);
 if (nextFirstPage === firstPage) return queryData;

 return {
  ...queryData,
  pages: [nextFirstPage, ...rest],
 };
};

const buildSeededHomeFeedData = (
 optimisticPost: ApiPost,
 limit: number,
): { pages: PostsResponse[]; pageParams: number[] } => ({
 pages: [
  {
   posts: [optimisticPost],
   total: 1,
   page: 1,
   limit,
   has_more: false,
  },
 ],
 pageParams: [1],
});

export const upsertHomePost = (
 queryClient: QueryClient,
 optimisticPost: ApiPost,
 options?: UpsertHomePostOptions,
) => {
  const postQueries = queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() });
  postQueries.forEach(([queryKey, queryData]) => {
    if (!queryData) return;
    const filters = getPostsFiltersFromKey(queryKey);
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
      const nextData = upsertPostIntoInfinitePostsData(dataWithPages, optimisticPost);
      if (nextData !== dataWithPages) queryClient.setQueryData(queryKey, nextData);
    } else {
      const dataSingle = queryData as PostsResponse;
      const nextData = upsertPostIntoPostsResponse(dataSingle, optimisticPost);
      if (nextData !== dataSingle) queryClient.setQueryData(queryKey, nextData);
    }
  });

  if (!options) return;

  (["magic", "newest"] as const).forEach((by) => {
    const queryKey = queryKeys.posts(withSessionLensPicks({
      limit: options.limit ?? 10,
      feed: "home" as const,
      by,
      allowed_tags: options.allowedTags || undefined,
      address: options.address,
      page: undefined,
    }, options.address));

    queryClient.setQueryData(queryKey, (oldData: unknown) => {
      if (!oldData) return buildSeededHomeFeedData(optimisticPost, options.limit ?? 10);
      if (
        typeof oldData === "object" &&
        oldData !== null &&
        "pages" in oldData
      ) {
        return upsertPostIntoInfinitePostsData(
          oldData as { pages: PostsResponse[]; pageParams: unknown[] },
          optimisticPost,
        );
      }
      return upsertPostIntoPostsResponse(oldData as PostsResponse, optimisticPost);
    });
  });
};

const refreshHomeFeedsPreservingPost = (
  queryClient: QueryClient,
  post: ApiPost,
  options: UpsertHomePostOptions,
) => {
  upsertHomePost(queryClient, post, options);
  useHomePostCardStore.getState().triggerScrollToTop();

  const homeQueries = queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() })
    .filter(([queryKey]) => getPostsFiltersFromKey(queryKey)?.feed === "home");
  void Promise.all(homeQueries.map(async ([queryKey, currentData]) => {
    const filters = getPostsFiltersFromKey(queryKey);
    if (!filters) return;
    const refreshedFirstPage = await getPosts({ ...filters, page: 1 });
    const pendingPost = usePendingPostsStore.getState().getPost(post.post_id);
    const preserveProcessingPost = isPostVideoProcessing(pendingPost);
    const postToPreserve = preserveProcessingPost
      ? pendingPost!
      : {
          ...post,
          optimistic_status: undefined,
          optimistic_error: undefined,
          optimistic_draft: undefined,
          optimistic_video_preview_until: undefined,
          optimistic_cached_until: undefined,
        };
    const transientSuccessActive = isTransientPostSuccessActive(post.post_id);
    const mergedFirstPage = mergeRefreshedPostPreservingOrder(
      refreshedFirstPage,
      postToPreserve,
      transientSuccessActive,
      preserveProcessingPost,
    );
    const refreshedMatch = refreshedFirstPage.posts.some((item) => item.post_id === post.post_id);
    Sentry.addBreadcrumb({
      category: "create-post",
      message: "Home refresh merged confirmed post",
      level: "info",
      data: {
        postId: post.post_id,
        by: filters.by,
        refreshedMatch,
        usedTemporaryFallback: !refreshedMatch && (transientSuccessActive || preserveProcessingPost),
        preservedProcessingPost: preserveProcessingPost,
        transientSuccessActive,
      },
    });
    queryClient.setQueryData(queryKey, (latestData: unknown) => {
      const data = latestData ?? currentData;
      if (
        typeof data === "object" &&
        data !== null &&
        "pages" in data
      ) {
        const infiniteData = data as { pages: PostsResponse[]; pageParams: unknown[] };
        return {
          ...infiniteData,
          pages: [
            mergedFirstPage,
            ...infiniteData.pages.slice(1),
          ],
        };
      }
      return mergedFirstPage;
    });
  })).catch((error) => {
    Sentry.captureException(error, {
      tags: { feature: "posts", operation: "refresh-home-after-create" },
      extra: { postId: post.post_id },
    });
  });
};

export const removeOptimisticPostFromCache = (queryClient: QueryClient, postId: string) => {
  Sentry.addBreadcrumb({
    category: "create-post",
    message: "Removing optimistic post from cache",
    level: "info",
    data: { postId },
  });
  clearTransientPostSuccess(queryClient, postId);
  usePendingPostsStore.getState().removePost(postId);
  updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), (data) => removePostFromPostsData(data, postId));
};

export const markOptimisticPostError = (
  queryClient: QueryClient,
  postId: string,
  errorMessage: string,
) => {
  Sentry.addBreadcrumb({
    category: "create-post",
    message: "Marking optimistic post as error",
    level: "warning",
    data: {
      postId,
      errorMessage,
    },
  });
  usePendingPostsStore.getState().markPostError(postId, errorMessage);
  updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), (data) => {
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

const setOptimisticPostStatus = (
  queryClient: QueryClient,
  postId: string,
  status: ApiPost["optimistic_status"] | undefined,
  options: {
    errorMessage?: string;
    previewMediaUrls?: string[];
    keepDraft?: boolean;
  } = {},
) => {
  if (status === "pending" || status === "error") {
    const persistedPost = usePendingPostsStore
      .getState()
      .posts.find((post) => post.post_id === postId);
    if (persistedPost) {
      usePendingPostsStore.getState().upsertPost({
        ...persistedPost,
        optimistic_status: status,
        optimistic_error: options.errorMessage,
        optimistic_draft: options.keepDraft ? persistedPost.optimistic_draft : undefined,
        optimistic_video_preview_until: options.previewMediaUrls?.length
          ? Date.now() + 45000
          : persistedPost.optimistic_video_preview_until,
      });
    }
  } else if (options.previewMediaUrls?.length) {
    const persistedPost = usePendingPostsStore
      .getState()
      .posts.find((post) => post.post_id === postId);
    if (persistedPost) {
      usePendingPostsStore.getState().upsertPost({
        ...persistedPost,
        optimistic_status: undefined,
        optimistic_error: undefined,
        optimistic_cached_until: undefined,
      });
    }
  } else {
    usePendingPostsStore.getState().removePost(postId);
  }

  updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), (data) => {
    if (!data) return { nextData: data, didUpdate: false };
    const updatePost = (post: ApiPost) =>
      post.post_id === postId
        ? {
            ...post,
            optimistic_status: status,
            optimistic_error: options.errorMessage,
            optimistic_draft: options.keepDraft || options.previewMediaUrls?.length
              ? post.optimistic_draft
              : undefined,
            optimistic_video_preview_until: options.previewMediaUrls?.length
              ? Date.now() + 45000
              : post.optimistic_video_preview_until,
          }
        : post;
    if (isInfinitePostsData(data)) {
      let didUpdate = false;
      const pages = data.pages.map((page) => {
        const posts = page.posts.map((post) => {
          if (post.post_id !== postId) return post;
          didUpdate = true;
          return updatePost(post);
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
      return updatePost(post);
    });
    return { nextData: didUpdate ? { ...singleData, posts } : data, didUpdate };
  });
};

const scheduleClearOptimisticPostStatus = (
  queryClient: QueryClient,
  postId: string,
) => {
  cancelTransientPostSuccess(postId);
  transientPostSuccessExpiresAt.set(postId, Date.now() + TRANSIENT_POST_SUCCESS_MS);
  Sentry.addBreadcrumb({
    category: "create-post",
    message: "Transient post success registered",
    level: "info",
    data: { postId, durationMs: TRANSIENT_POST_SUCCESS_MS },
  });
  const timer = setTimeout(() => {
    clearTransientPostSuccess(queryClient, postId);
  }, TRANSIENT_POST_SUCCESS_MS);
  transientPostSuccessTimers.set(postId, timer);
};

export const markOptimisticPostSuccess = (
  queryClient: QueryClient,
  postId: string,
  previewMediaUrls?: string[],
) => {
  Sentry.addBreadcrumb({
    category: "create-post",
    message: "Marking optimistic post as success",
    level: "info",
    data: {
      postId,
      previewCount: previewMediaUrls?.length ?? 0,
    },
  });
  setOptimisticPostStatus(queryClient, postId, "success", { previewMediaUrls });
  scheduleClearOptimisticPostStatus(queryClient, postId);
};

export { markOptimisticVideoProcessingComplete } from "@/src/api/cache/complete-video-processing";

const replaceOrUpdateOptimisticPost = (
  queryClient: QueryClient,
  optimisticId: string,
  nextPost: ApiPost,
) => {
  updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), (data) => {
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

const findPostInPostsData = (data: unknown, postId: string): ApiPost | null => {
  if (!data) return null;
  if (isInfinitePostsData(data)) {
    for (const page of data.pages) {
      const match = page.posts.find((post) => post.post_id === postId);
      if (match) return match;
    }
    return null;
  }

  const singleData = data as PostsResponse;
  return singleData.posts?.find((post) => post.post_id === postId) ?? null;
};

const addRootPostIdFromPost = (post: ApiPost | null, rootPostIds: Set<string>) => {
  if (!post?.root_post_id || post.root_post_id === post.post_id) return;
  rootPostIds.add(post.root_post_id);
};

const findRootPostIdsForCachedComment = (
  queryClient: QueryClient,
  commentId: string,
): Set<string> => {
  const rootPostIds = new Set<string>();

  queryClient.getQueriesData({ queryKey: queryKeys.userPostsRoot() }).forEach(([, data]) => {
    addRootPostIdFromPost(findPostInPostsData(data, commentId), rootPostIds);
  });

  queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() }).forEach(([, data]) => {
    addRootPostIdFromPost(findPostInPostsData(data, commentId), rootPostIds);
  });

  return rootPostIds;
};

const applyCommentDeltaToRootPostCaches = (
  queryClient: QueryClient,
  rootPostId: string,
  delta: number,
) => {
  updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), (queryData) =>
    applyCommentDeltaToPostsData(queryData, rootPostId, delta),
  );
  updateQueriesWithReducer(queryClient, queryKeys.userPostsRoot(), (queryData) =>
    applyCommentDeltaToPostsData(queryData, rootPostId, delta),
  );
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

export const applyOptimisticPostEdit = (
  queryClient: QueryClient,
  input: EditPostMutationInput,
  status: ApiPost["optimistic_status"],
  errorMessage?: string,
) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const updatePost = <T extends ApiPost>(post: T): T => {
    if (post.post_id !== input.postId) return post;
    return {
      ...post,
      title: input.title,
      content: input.content,
      tag: input.tag ?? post.tag,
      community: input.community ?? post.community,
      media: input.media ?? post.media,
      edited_at: nowSeconds,
      optimistic_status: status,
      optimistic_error: errorMessage,
      optimistic_action_id: input.optimisticActionId,
    } as T;
  };

  const applyToPostsData = (data: unknown): { nextData: unknown; didUpdate: boolean } => {
    if (!data) return { nextData: data, didUpdate: false };
    if (isInfinitePostsData(data)) {
      let didUpdate = false;
      const nextPages = data.pages.map((page) => {
        let didUpdatePage = false;
        const nextPosts = page.posts.map((post) => {
          const updated = updatePost(post);
          if (updated !== post) didUpdatePage = true;
          return updated;
        });
        if (!didUpdatePage) return page;
        didUpdate = true;
        return { ...page, posts: nextPosts };
      });
      return { nextData: didUpdate ? { ...data, pages: nextPages } : data, didUpdate };
    }
    const singleData = data as PostsResponse;
    let didUpdate = false;
    const nextPosts = singleData.posts.map((post) => {
      const updated = updatePost(post);
      if (updated !== post) didUpdate = true;
      return updated;
    });
    return { nextData: didUpdate ? { ...singleData, posts: nextPosts } : data, didUpdate };
  };

  updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), applyToPostsData);
  updateQueriesWithReducer(queryClient, queryKeys.userPostsRoot(), applyToPostsData);

  queryClient.getQueriesData<CommentsResponse>({ queryKey: queryKeys.commentsRoot() }).forEach(([queryKey, queryData]) => {
    if (!queryData?.root || queryData.root.post_id !== input.postId) return;
    queryClient.setQueryData<CommentsResponse>(queryKey, {
      ...queryData,
      root: updatePost(queryData.root),
    });
  });
};

const restoreQuerySnapshots = (
  queryClient: QueryClient,
  snapshots: [QueryKey, unknown][] | undefined,
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
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);

  return useMutation({
    mutationKey: mutationKeys.post.create(),
    mutationFn: async (input: CreatePostMutationInput) => {
      const wallet = await getWallet();
      const { optimisticId, optimisticActionId, optimisticMediaUrl, optimisticMediaUrls, optimisticPreviewMediaUrls, optimisticMediaMeta, optimisticDraft, ...postInput } = input;
      const result = await createPost(wallet, postInput, options.onPoWProgress);
      if (result.code !== undefined && result.code !== 0) {
        Sentry.addBreadcrumb({
          category: "create-post",
          message: "Create post transaction rejected",
          level: "warning",
          data: {
            code: result.code,
            hasRawLog: !!result.raw_log,
            optimisticId,
            optimisticActionId,
          },
        });
        throw Object.assign(
          new Error(result.raw_log || "Transaction was rejected by the chain."),
          { response: { data: { error_code: "transaction_rejected", error_details: result.raw_log } } },
        );
      }
      return result;
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
      trackEvent("post_created", {
        topic: input.community,
        media_count: input.media?.length ?? 0,
        has_content_warning: !!input.tag,
        content_warning: input.tag || undefined,
      });
      const confirmedPostId = (data?.post_id ?? data?.tx_hash)?.toLowerCase();
      const optimisticPost = buildOptimisticPost(
        confirmedPostId,
        input,
        address,
        username,
      );
      const confirmedPost = {
        ...optimisticPost,
        optimistic_status: undefined,
        optimistic_error: undefined,
        optimistic_draft: undefined,
      };
      const upsertOptions = {
        address: address ?? undefined,
        allowedTags: getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled) || undefined,
        limit: 10,
      };
      if (input.optimisticId) {
        const videoPreviewMediaUrls = getVideoPreviewMediaUrls(input);
        Sentry.addBreadcrumb({
          category: "create-post",
          message: "Replacing optimistic post with confirmed post",
          level: "info",
          data: {
            optimisticId: input.optimisticId,
            confirmedPostId: confirmedPost.post_id,
            hasPreviewMedia: !!input.optimisticPreviewMediaUrls?.length,
            hasVideoPreviewMedia: !!videoPreviewMediaUrls?.length,
          },
        });
        const postAfterNetworkConfirmation = {
          ...confirmedPost,
          optimistic_status: "success" as const,
          optimistic_error: undefined,
          optimistic_draft: input.optimisticDraft,
          optimistic_action_id: input.optimisticActionId,
          optimistic_video_preview_until: videoPreviewMediaUrls?.length
            ? Date.now() + 45000
            : confirmedPost.optimistic_video_preview_until,
        };
        usePendingPostsStore.getState().removePost(
          input.optimisticId,
          input.optimisticActionId,
        );
        usePendingPostsStore.getState().upsertPost(postAfterNetworkConfirmation);
        replaceOrUpdateOptimisticPost(queryClient, input.optimisticId, postAfterNetworkConfirmation);
        Sentry.addBreadcrumb({
          category: "create-post",
          message: "Optimistic post ID transitioned to confirmed ID",
          level: "info",
          data: {
            optimisticId: input.optimisticId,
            confirmedPostId: confirmedPost.post_id,
            isVideo: !!videoPreviewMediaUrls?.length,
          },
        });
        scheduleClearOptimisticPostStatus(queryClient, confirmedPost.post_id);
        refreshHomeFeedsPreservingPost(queryClient, postAfterNetworkConfirmation, upsertOptions);
        if (videoPreviewMediaUrls?.length) {
          Sentry.addBreadcrumb({
            category: "create-post",
            message: "Switched confirmed video post to hosted media",
            level: "info",
            data: {
              postId: confirmedPost.post_id,
              previewCount: videoPreviewMediaUrls.length,
              hostedMediaCount: confirmedPost.media?.length ?? 0,
            },
          });
        }
      } else {
        scheduleClearOptimisticPostStatus(queryClient, optimisticPost.post_id);
        refreshHomeFeedsPreservingPost(queryClient, optimisticPost, upsertOptions);
      }

     // Invalidate user posts
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPostsForOwner(address),
          refetchType: "inactive",
        });
      }

      // Invalidate topics cache to include newly created topics
      queryClient.invalidateQueries({
        queryKey: queryKeys.communitiesRoot(),
        refetchType: "inactive",
      });


    },
    onError: (error, input) => {
      Sentry.captureException(error, {
        tags: { feature: "posts", operation: "create" },
        extra: {
          optimisticId: input.optimisticId,
          optimisticActionId: input.optimisticActionId,
          mediaCount: input.media?.length ?? 0,
          hasPreviewMedia: !!input.optimisticPreviewMediaUrls?.length,
        },
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
    mutationKey: mutationKeys.post.comment(),
    mutationFn: async (input: CreateCommentInput & { serverIdentity?: string }) => {
      const server = input.serverIdentity ?? getServerIdentity();
      assertReplyNotRejected(server, input.parentId);
      const wallet = await getWallet();
      if (server !== getServerIdentity()) throw new StaleServerResponseError();
      assertReplyNotRejected(server, input.parentId);
      try {
        return await createComment(wallet, input, options.onPoWProgress);
      } catch (error) {
        useReplyRejectionStore.getState().recordRejection(server, input.parentId, error);
        if (isLegacyThreadReadOnlyError(error)) throw new LegacyThreadReadOnlyError();
        throw error;
      }
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.commentsRoot() });
      await queryClient.cancelQueries({ queryKey: queryKeys.postsRoot() });
      await queryClient.cancelQueries({ queryKey: queryKeys.userPostsRoot() });

      const previousComments = queryClient.getQueriesData<CommentsResponse>({
        queryKey: queryKeys.commentsRoot(),
      }) as [QueryKey, CommentsResponse | undefined][];
      const previousPosts = queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() }) as [QueryKey, unknown][];
      const previousUserPosts = queryClient.getQueriesData({ queryKey: queryKeys.userPostsRoot() }) as [QueryKey, unknown][];

      const optimisticCommentId = `optimistic-${Date.now()}`;
      const affectedRootPostIds = new Set<string>();
      if (input.rootPostId) {
        affectedRootPostIds.add(input.rootPostId);
      }

      previousComments.forEach(([queryKey, queryData]) => {
        if (!queryData?.root) return;

        const isTopLevelComment = queryData.root.post_id === input.parentId;
        const isReplyToNestedComment = commentTreeContainsId(
          queryData.children,
          input.parentId,
        );

        if (!isTopLevelComment && !isReplyToNestedComment) return;
        affectedRootPostIds.add(queryData.root.post_id);

        queryClient.setQueryData<CommentsResponse>(queryKey, {
          ...queryData,
          root: {
            ...queryData.root,
            comments: (queryData.root.comments ?? 0) + 1,
          },
        });
      });

      if (affectedRootPostIds.size === 0) {
        affectedRootPostIds.add(input.parentId);
      }

      affectedRootPostIds.forEach((rootPostId) => {
        applyCommentDeltaToRootPostCaches(queryClient, rootPostId, 1);
      });

      return {
        previousComments,
        previousPosts,
        previousUserPosts,
        optimisticCommentId,
      };
    },
    onError: (_error, _input, context) => {
      if (isLegacyThreadReadOnlyError(_error)) {
        Sentry.addBreadcrumb({ category: "comment", message: "Parent rejected reply", level: "info", data: { parentId: _input.parentId } });
      } else {
        Sentry.captureException(_error, {
          tags: { feature: "posts", operation: "comment" },
          extra: { parentId: _input.parentId },
        });
      }
      restoreQuerySnapshots(queryClient, context?.previousComments);
      restoreQuerySnapshots(queryClient, context?.previousPosts);
      restoreQuerySnapshots(queryClient, context?.previousUserPosts);
    },
    onSuccess: (_data, input) => {
      trackEvent("comment_posted", {
        is_reply: !!input.rootPostId && input.rootPostId !== input.parentId,
        has_media: (input.media?.length ?? 0) > 0,
      });

    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commentsRoot(),
        refetchType: "active",
      });

      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPostsForOwner(address),
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
    mutationKey: mutationKeys.post.edit(),
    mutationFn: async (input: EditPostMutationInput) => {
      const wallet = await getWallet();
      return editPost(wallet, input, options.onPoWProgress);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.postsRoot() });
      await queryClient.cancelQueries({ queryKey: queryKeys.commentsRoot() });
      if (address) {
        await queryClient.cancelQueries({ queryKey: queryKeys.userPostsForOwner(address) });
      }

      const previousPosts = queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() }) as [QueryKey, unknown][];
      const previousUserPosts = queryClient.getQueriesData({ queryKey: queryKeys.userPostsRoot() }) as [QueryKey, unknown][];
      const previousComments = queryClient.getQueriesData({ queryKey: queryKeys.commentsRoot() }) as [QueryKey, unknown][];

      applyOptimisticPostEdit(queryClient, input, "pending");

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
    onSuccess: (_data, input) => {
      applyOptimisticPostEdit(queryClient, input, "success");
      setTimeout(() => {
        updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), (queryData) => {
          if (!queryData) return { nextData: queryData, didUpdate: false };
          const clearStatus = (post: ApiPost) =>
            post.post_id === input.postId
              ? {
                  ...post,
                  optimistic_status: undefined,
                  optimistic_error: undefined,
                  optimistic_action_id: undefined,
                }
              : post;
          if (isInfinitePostsData(queryData)) {
            let didUpdate = false;
            const pages = queryData.pages.map((page) => {
              const posts = page.posts.map((post) => {
                if (post.post_id !== input.postId) return post;
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
            if (post.post_id !== input.postId) return post;
            didUpdate = true;
            return clearStatus(post);
          });
          return { nextData: didUpdate ? { ...singleData, posts } : queryData, didUpdate };
        });
        updateQueriesWithReducer(queryClient, queryKeys.userPostsRoot(), (queryData) => {
          if (!queryData) return { nextData: queryData, didUpdate: false };
          const clearStatus = (post: ApiPost) =>
            post.post_id === input.postId
              ? {
                  ...post,
                  optimistic_status: undefined,
                  optimistic_error: undefined,
                  optimistic_action_id: undefined,
                }
              : post;
          if (isInfinitePostsData(queryData)) {
            let didUpdate = false;
            const pages = queryData.pages.map((page) => {
              const posts = page.posts.map((post) => {
                if (post.post_id !== input.postId) return post;
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
            if (post.post_id !== input.postId) return post;
            didUpdate = true;
            return clearStatus(post);
          });
          return { nextData: didUpdate ? { ...singleData, posts } : queryData, didUpdate };
        });
        queryClient.getQueriesData<CommentsResponse>({ queryKey: queryKeys.commentsRoot() }).forEach(([queryKey, queryData]) => {
          if (!queryData?.root || queryData.root.post_id !== input.postId) return;
          queryClient.setQueryData<CommentsResponse>(queryKey, {
            ...queryData,
            root: {
              ...queryData.root,
              optimistic_status: undefined,
              optimistic_error: undefined,
              optimistic_action_id: undefined,
            },
          });
        });
      }, 2000);
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
    mutationKey: mutationKeys.post.delete(),
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
      clearTransientPostSuccess(queryClient, input.postId);
      await queryClient.cancelQueries({ queryKey: queryKeys.commentsRoot() });
      await queryClient.cancelQueries({ queryKey: queryKeys.postsRoot() });
      await queryClient.cancelQueries({ queryKey: queryKeys.userPostsRoot() });

      const previousComments = queryClient.getQueriesData<CommentsResponse>({
        queryKey: queryKeys.commentsRoot(),
      }) as [QueryKey, CommentsResponse | undefined][];
      const previousPosts = queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() }) as [QueryKey, unknown][];
      const previousUserPosts = queryClient.getQueriesData({
        queryKey: queryKeys.userPostsRoot(),
      }) as [QueryKey, unknown][];
      const previousPendingPosts = usePendingPostsStore.getState().posts;
      const pendingMatch = previousPendingPosts.find((post) =>
        post.post_id.toLowerCase() === input.postId.toLowerCase(),
      );
      const optimisticActionId = pendingMatch?.optimistic_action_id;

      usePendingPostsStore.getState().removePost(input.postId, optimisticActionId);
      Sentry.addBreadcrumb({
        category: "delete-post",
        message: "Delete aliases removed optimistically",
        level: "info",
        data: {
          postId: input.postId,
          hasOptimisticActionId: !!optimisticActionId,
          pendingMatch: !!pendingMatch,
        },
      });

      const affectedRootPostIds = findRootPostIdsForCachedComment(queryClient, input.postId);
      if (input.rootPostId) {
        affectedRootPostIds.add(input.rootPostId);
      }

      previousComments.forEach(([queryKey, queryData]) => {
        if (!queryData?.root || queryData.root.post_id === input.postId) {
          return;
        }

        const removalResult = removeCommentFromTree(queryData.children, input.postId);
        if (!removalResult.removed) {
          return;
        }
        affectedRootPostIds.add(queryData.root.post_id);

        queryClient.setQueryData<CommentsResponse>(queryKey, {
          ...queryData,
          root: {
            ...queryData.root,
            comments: Math.max(0, (queryData.root.comments ?? 0) - 1),
          },
          children: removalResult.nextComments,
        });
      });

      affectedRootPostIds.forEach((rootPostId) => {
        applyCommentDeltaToRootPostCaches(queryClient, rootPostId, -1);
      });

      updateQueriesWithReducer(queryClient, queryKeys.postsRoot(), (queryData) =>
        removePostFromPostsData(queryData, input.postId),
      );
      updateQueriesWithReducer(queryClient, queryKeys.userPostsRoot(), (queryData) =>
        removePostFromPostsData(queryData, input.postId),
      );
      [
        queryKeys.postsRoot(),
        queryKeys.userPostsRoot(),
        queryKeys.commentsRoot(),
      ].forEach((queryKey) => {
        queryClient.setQueriesData({ queryKey }, (data) =>
          removePostAliasesFromData(data, input.postId, optimisticActionId),
        );
      });

      return {
        previousComments,
        previousPosts,
        previousUserPosts,
        previousPendingPosts,
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
      clearTransientPostSuccess(queryClient, _input.postId);
      if (context?.previousPendingPosts) {
        usePendingPostsStore.setState({ posts: context.previousPendingPosts });
      }
      Sentry.addBreadcrumb({
        category: "delete-post",
        message: "Failed delete state restored",
        level: "warning",
        data: {
          postId: _input.postId,
          restoredComments: context?.previousComments?.length ?? 0,
          restoredPostQueries: context?.previousPosts?.length ?? 0,
          restoredUserPostQueries: context?.previousUserPosts?.length ?? 0,
          restoredPendingPosts: context?.previousPendingPosts?.length ?? 0,
        },
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot(), refetchType: "inactive" });
      queryClient.invalidateQueries({ queryKey: queryKeys.commentsRoot(), refetchType: "inactive" });

      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPostsForOwner(address),
          refetchType: "inactive",
        });
      }
    },
  });
}
