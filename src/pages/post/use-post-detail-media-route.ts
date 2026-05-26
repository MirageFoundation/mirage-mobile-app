import * as Sentry from "@sentry/react-native";
import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useComments } from "@/src/api/read";
import { getRootPostId } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
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

  const routeCommentsQuery = useComments(params.id!, {
    enabled: !!params.id && (!!params.highlight || !!params.depth),
  });
  const routeRootIdQuery = useQuery({
    queryKey: queryKeys.rootPostId(params.id!),
    queryFn: () => getRootPostId({ comment_id: params.id! }),
    enabled: !!params.id && (!!params.highlight || !!params.depth) && !routeCommentsQuery.data,
    staleTime: 1000 * 60 * 60,
  });
  const routeCommentRoot = routeCommentsQuery.data?.root;
  const isRouteComment = !!(
    routeCommentRoot?.post_id &&
    routeCommentRoot.root_post_id &&
    routeCommentRoot.root_post_id.toLowerCase() !== routeCommentRoot.post_id.toLowerCase()
  );
  const routeRootPostId = isRouteComment
    ? routeCommentRoot?.root_post_id
    : routeRootIdQuery.data?.root_post_id ?? null;
  const routeHighlightCommentId =
    params.highlight ??
    (isRouteComment
      ? routeCommentRoot?.post_id
      : routeRootPostId && params.id !== routeRootPostId
      ? params.id
      : undefined);
  const routeRootCommentsQuery = useComments(routeRootPostId!, {
    enabled: !!routeRootPostId,
  });
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
    if (routeRootIdQuery.isError) {
      Sentry.captureException(routeRootIdQuery.error, {
        tags: { feature: "post-routing", operation: "focused-route-root-id" },
        extra: {
          routePostId: params.id,
          highlight: params.highlight,
          depth: params.depth,
        },
      });
    }
    if (routeRootCommentsQuery.isError) {
      Sentry.captureException(routeRootCommentsQuery.error, {
        tags: { feature: "post-routing", operation: "focused-route-root-comments" },
        extra: {
          routePostId: params.id,
          rootPostId: routeRootPostId,
          highlight: params.highlight,
          depth: params.depth,
        },
      });
    }
  }, [
    routeCommentsQuery.isError,
    routeCommentsQuery.error,
    routeRootIdQuery.isError,
    routeRootIdQuery.error,
    routeRootCommentsQuery.isError,
    routeRootCommentsQuery.error,
    params.id,
    params.highlight,
    params.depth,
    routeRootPostId,
  ]);

  const cachedRoot = useMemo(() => {
    if (!params.id) return null;
    if (!isRouteComment && routeCommentsQuery.data?.root) {
      return routeCommentsQuery.data.root;
    }
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

    const cachedQueries = queryClient.getQueriesData({});
    for (const [, queryData] of cachedQueries) {
      const matched = findPostInCachedData(queryData, params.id);
      if (matched) return matched;
    }
    return null;
  }, [
    params.id,
    isRouteComment,
    routeCommentsQuery.data?.root,
    routeRootPostId,
    currentUserWallet,
    queryClient,
    savedPostsForRouting,
    historyEntriesForRouting,
  ]);

  const routingRoot = routeRootCommentsQuery.data?.root ?? cachedRoot;
  const useImmersive = cachedPostHasImmersiveMedia(routingRoot);
  const isResolvingFocusedMediaRoute = !!(
    params.id &&
    (params.highlight || params.depth) &&
    (routeCommentsQuery.isLoading ||
      routeRootIdQuery.isLoading ||
      (routeRootPostId && routeRootCommentsQuery.isLoading))
  );

  useEffect(() => {
    if (!params.id || (!params.highlight && !params.depth)) return;
    if (isResolvingFocusedMediaRoute || routingRoot || unresolvedFocusedRouteCapturedRef.current) return;
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
        hasRouteRootIdData: !!routeRootIdQuery.data,
        hasRouteRootCommentsData: !!routeRootCommentsQuery.data,
      },
    });
  }, [
    params.id,
    params.highlight,
    params.depth,
    isResolvingFocusedMediaRoute,
    routingRoot,
    routeRootPostId,
    routeCommentsQuery.data,
    routeRootIdQuery.data,
    routeRootCommentsQuery.data,
  ]);

  return {
    isResolvingFocusedMediaRoute,
    routeHighlightCommentId,
    routeRootPostId,
    useImmersive,
  };
}
