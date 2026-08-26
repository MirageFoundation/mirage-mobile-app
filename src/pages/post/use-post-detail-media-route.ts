import * as Sentry from "@sentry/react-native";
import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useComments } from "@/src/api/read";
import { queryKeys } from "@/src/api/read/query-keys";
import { readThreadAncestors } from "@/src/api/read/thread-ancestors";
import type { CommentsResponse } from "@/src/api/types";
import {
  useAuthStore,
  useSavedPostsStore,
} from "@/src/stores";
import { useHistoryStore } from "@/src/stores/history-store";
import {
  cachedPostHasImmersiveMedia,
  findPostInCachedData,
} from "./post-detail-media-routing";

type PostDetailRouteParams = {
  id?: string;
  highlight?: string;
  depth?: string;
};

type RoutablePost = {
  id?: string;
  post_id?: string;
  [key: string]: unknown;
};

export function usePostDetailMediaRoute(params: PostDetailRouteParams) {
  const queryClient = useQueryClient();
  const currentUserWallet = useAuthStore((s) => s.user?.walletAddress);
  const savedPostsForRouting = useSavedPostsStore((s) => s.savedPosts as RoutablePost[]);
  const historyEntriesForRouting = useHistoryStore((s) => s.entries as RoutablePost[]);

  // B-2.6: this single response carries the focused comment, its reply subtree,
  // AND its ancestor chain (root post first). Routing needs nothing else — the
  // old `get_root_post_id` lookup and second `get_comments(rootId)` are gone.
  const routeCommentsQuery = useComments(params.id!, {
    enabled: !!params.id && (!!params.highlight || !!params.depth),
  });
  const thread = readThreadAncestors(routeCommentsQuery.data);
  const isRouteComment = thread.isComment;
  const routeRootPostId = thread.rootPostId;
  const routeHighlightCommentId =
    params.highlight ??
    (isRouteComment
      ? routeCommentsQuery.data?.root?.post_id
      : routeRootPostId && params.id !== routeRootPostId
      ? params.id
      : undefined);
  const unresolvedFocusedRouteCapturedRef = useRef(false);

  useEffect(() => {
    if (routeCommentsQuery.isError) {
      Sentry.captureException(routeCommentsQuery.error, {
        tags: { feature: "post-routing", operation: "focused-route-comments" },
        extra: {
          routePostId: params.id,
          highlight: params.highlight,
          depth: params.depth,
        },
      });
    }
  }, [
    routeCommentsQuery.isError,
    routeCommentsQuery.error,
    params.id,
    params.highlight,
    params.depth,
  ]);

  const cachedRoot = useMemo(() => {
    if (!params.id) return null;
    // The thread response carries the root post directly.
    if (thread.rootPost) return thread.rootPost;
    if (routeRootPostId) {
      const rootComments = queryClient.getQueryData<CommentsResponse>(
        queryKeys.comments(routeRootPostId, currentUserWallet ?? undefined),
      );
      if (rootComments?.root) return rootComments.root;
    }
    const commentsRoot = queryClient.getQueryData<CommentsResponse>(
      queryKeys.comments(params.id, currentUserWallet ?? undefined),
    );
    if (commentsRoot?.root) return commentsRoot.root;
    const savedPost = savedPostsForRouting.find((post) => post.id === params.id);
    if (savedPost) return savedPost;
    const historyPost = historyEntriesForRouting.find((post) => post.id === params.id);
    if (historyPost) return historyPost;

    // Bounded fallback: only scan the query families that can actually
    // contain posts, instead of iterating the entire query cache with a
    // deep recursive search on the post-open render path (B-2.8).
    const postBearingRoots = [
      queryKeys.postsRoot(),
      queryKeys.userPostsRoot(),
      queryKeys.commentsRoot(),
    ];
    for (const rootKey of postBearingRoots) {
      const cachedQueries = queryClient.getQueriesData({ queryKey: rootKey });
      for (const [, queryData] of cachedQueries) {
        const matched = findPostInCachedData(queryData, params.id);
        if (matched) return matched;
      }
    }
    return null;
  }, [
    params.id,
    routeRootPostId,
    thread.rootPost,
    currentUserWallet,
    queryClient,
    savedPostsForRouting,
    historyEntriesForRouting,
  ]);

  const useImmersive = cachedPostHasImmersiveMedia(cachedRoot);
  const isResolvingFocusedMediaRoute = !!(
    params.id &&
    (params.highlight || params.depth) &&
    routeCommentsQuery.isLoading
  );

  useEffect(() => {
    if (!params.id || (!params.highlight && !params.depth)) return;
    if (isResolvingFocusedMediaRoute || cachedRoot || unresolvedFocusedRouteCapturedRef.current) return;
    unresolvedFocusedRouteCapturedRef.current = true;
    Sentry.captureMessage("Focused post route resolved without root post", {
      level: "warning",
      tags: { feature: "post-routing", operation: "focused-route-unresolved" },
      extra: {
        routePostId: params.id,
        rootPostId: routeRootPostId,
        highlight: params.highlight,
        depth: params.depth,
        hasRouteCommentsData: !!routeCommentsQuery.data,
        threadResolved: thread.resolved,
      },
    });
  }, [
    params.id,
    params.highlight,
    params.depth,
    isResolvingFocusedMediaRoute,
    cachedRoot,
    routeRootPostId,
    routeCommentsQuery.data,
    thread.resolved,
  ]);

  return {
    isResolvingFocusedMediaRoute,
    routeHighlightCommentId,
    routeRootPostId,
    useImmersive,
  };
}
