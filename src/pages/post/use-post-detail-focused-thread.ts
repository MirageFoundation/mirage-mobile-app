import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { useComments } from "@/src/api/read";
import { getCommentContext, getComments } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import type { CommentsResponse, Post as ApiPost, PostWithChildren } from "@/src/api/types";
import { parseApiError } from "@/src/utils/parse-api-error";

type UsePostDetailFocusedThreadInput = {
  commentsData?: CommentsResponse;
  currentUserWallet?: string;
  depth?: string;
  highlight?: string;
  id: string;
  isFocused: boolean;
  isViewingComment: boolean;
  queryClient: QueryClient;
};

export function usePostDetailFocusedThread({
  commentsData,
  currentUserWallet,
  depth,
  highlight,
  id,
  isFocused,
  isViewingComment,
  queryClient,
}: UsePostDetailFocusedThreadInput) {
  const actualRootPostId = useMemo(() => {
    const root = commentsData?.root;
    if (!root?.post_id) return null;
    return isViewingComment ? root.root_post_id : root.post_id;
  }, [commentsData?.root, isViewingComment]);
  const optimisticThreadId = isViewingComment ? actualRootPostId ?? id : id;

  const highlightCommentId = typeof highlight === "string" && highlight.length > 0 ? highlight : null;
  const [showFocusedThread, setShowFocusedThread] = useState(true);
  const focusedCommentId = showFocusedThread
    ? isViewingComment
      ? commentsData?.root?.post_id
      : highlightCommentId
    : null;
  const {
    data: focusedCommentData,
    isLoading: isLoadingFocusedComment,
    error: focusedCommentError,
  } = useComments(focusedCommentId, {
    enabled: isFocused && !!focusedCommentId && !isViewingComment,
  });
  const focusedCommentApiError = useMemo(() => {
    if (!focusedCommentError) return null;
    return parseApiError(focusedCommentError);
  }, [focusedCommentError]);
  const currentFocusedCommentNotFound = !!focusedCommentId && !isViewingComment && (
    focusedCommentApiError?.errorCode === "post_not_found" ||
    focusedCommentApiError?.errorCode === "comment_not_found" ||
    focusedCommentApiError?.httpStatus === 404
  );
  const [notFoundFocusedCommentId, setNotFoundFocusedCommentId] = useState<string | null>(null);
  const reportedFocusedCommentNotFoundRef = useRef<string | null>(null);
  useEffect(() => {
    setNotFoundFocusedCommentId(null);
  }, [focusedCommentId]);
  useEffect(() => {
    if (!focusedCommentId || !currentFocusedCommentNotFound) return;
    setNotFoundFocusedCommentId(focusedCommentId);
    const reportKey = `${id}:${focusedCommentId}:${focusedCommentApiError?.errorCode ?? focusedCommentApiError?.httpStatus ?? "unknown"}`;
    if (reportedFocusedCommentNotFoundRef.current === reportKey) return;
    reportedFocusedCommentNotFoundRef.current = reportKey;
    Sentry.captureMessage("Post detail focused comment not found", {
      level: "info",
      tags: {
        feature: "comments",
        operation: "focused-comment-not-found",
        screen: "post-detail",
        error_code: focusedCommentApiError?.errorCode ?? "unknown",
      },
      extra: {
        routePostId: id,
        rootPostId: actualRootPostId,
        focusedCommentId,
        highlight,
        depth,
        httpStatus: focusedCommentApiError?.httpStatus,
        hasAddress: !!currentUserWallet,
      },
    });
  }, [actualRootPostId, currentFocusedCommentNotFound, currentUserWallet, depth, focusedCommentApiError?.errorCode, focusedCommentApiError?.httpStatus, focusedCommentId, highlight, id]);
  const isFocusedCommentNotFound = !!focusedCommentId && (
    currentFocusedCommentNotFound || notFoundFocusedCommentId === focusedCommentId
  );
  const {
    data: fullThreadCommentsData,
    isLoading: isLoadingFullThreadComments,
  } = useComments(actualRootPostId, {
    enabled: isFocused && isViewingComment && !!actualRootPostId,
  });
  const [actualRootPost, setActualRootPost] = useState<PostWithChildren | null>(null);
  const [contextComments, setContextComments] = useState<ApiPost[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [hasLoadedFocusedContext, setHasLoadedFocusedContext] = useState(false);

  const contextDepth = useMemo(() => {
    if (!depth) return focusedCommentId ? 5 : 0;
    const parsed = Number(depth);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return Math.min(parsed, 5);
  }, [depth, focusedCommentId]);

  useEffect(() => {
    setShowFocusedThread(true);
  }, [id, highlight, depth]);

  const focusedContextCheckQuery = useQuery({
    queryKey: focusedCommentId
      ? queryKeys.commentContext(focusedCommentId, 5, currentUserWallet)
      : queryKeys.commentContext("missing", 5, currentUserWallet),
    queryFn: () =>
      getCommentContext({
        comment_id: focusedCommentId!,
        address: currentUserWallet,
        max_depth: 5,
      }),
    enabled: !!focusedCommentId,
    staleTime: 1000 * 60,
  });

  const loadFocusedContext = useCallback(
    async (maxDepth = 5) => {
      if (!focusedCommentId) return;
      const depthToLoad = Math.min(Math.max(maxDepth, 0), 5);
      if (depthToLoad <= 0) return;
      setIsLoadingContext(true);
      try {
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.commentContext(
            focusedCommentId,
            depthToLoad,
            currentUserWallet,
          ),
          queryFn: () =>
            getCommentContext({
              comment_id: focusedCommentId,
              address: currentUserWallet,
              max_depth: depthToLoad,
            }),
          staleTime: 1000 * 60,
        });
        setContextComments([...data.context].reverse());
        setHasLoadedFocusedContext(true);
      } catch (error) {
        Sentry.addBreadcrumb({
          category: "comments",
          message: "Failed to load focused comment context",
          data: { focusedCommentId, error: String(error) },
          level: "warning",
        });
      } finally {
        setIsLoadingContext(false);
      }
    },
    [focusedCommentId, currentUserWallet, queryClient],
  );

  useEffect(() => {
    setHasLoadedFocusedContext(false);
  }, [focusedCommentId]);

  useEffect(() => {
    if (!actualRootPostId) {
      setActualRootPost(null);
      return;
    }

    if (!isViewingComment && commentsData?.root?.post_id) {
      setActualRootPost(commentsData.root);
      return;
    }

    getComments({ post_id: actualRootPostId, address: currentUserWallet })
      .then((data) => setActualRootPost(data.root))
      .catch((error) => {
        Sentry.addBreadcrumb({
          category: "comments",
          message: "Failed to load focused comment root post",
          data: { actualRootPostId, error: String(error) },
          level: "warning",
        });
      });
  }, [isViewingComment, actualRootPostId, commentsData?.root, currentUserWallet]);

  useEffect(() => {
    if (!focusedCommentId || contextDepth <= 0) {
      setContextComments([]);
      setIsLoadingContext(false);
      return;
    }
    void loadFocusedContext(contextDepth);
  }, [focusedCommentId, contextDepth, loadFocusedContext]);

  return {
    actualRootPost,
    actualRootPostId,
    contextComments,
    contextDepth,
    focusedCommentData,
    focusedCommentId,
    focusedContextCheckQuery,
    fullThreadCommentsData,
    hasLoadedFocusedContext,
    highlightCommentId,
    isLoadingContext,
    isFocusedCommentNotFound,
    isLoadingFocusedComment,
    isLoadingFullThreadComments,
    loadFocusedContext,
    optimisticThreadId,
    setContextComments,
    setShowFocusedThread,
    showFocusedThread,
  };
}
