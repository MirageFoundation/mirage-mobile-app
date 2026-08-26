import * as Sentry from "@sentry/react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { useComments } from "@/src/api/read";
import { readThreadAncestors } from "@/src/api/read/thread-ancestors";
import type { CommentsResponse } from "@/src/api/types";
import { parseApiError } from "@/src/utils/parse-api-error";

type UsePostDetailFocusedThreadInput = {
  commentsData?: CommentsResponse;
  currentUserWallet?: string;
  depth?: string;
  highlight?: string;
  id: string;
  isFocused: boolean;
  isViewingComment: boolean;
};

export function usePostDetailFocusedThread({
  commentsData,
  currentUserWallet,
  depth,
  highlight,
  id,
  isFocused,
  isViewingComment,
}: UsePostDetailFocusedThreadInput) {
  // B-2.6: `get_comments` returns the whole thread — ancestor chain (root post
  // first), focused comment, and reply subtree — in one response. That is the
  // only thread contract; there is no multi-call stitch any more.
  const viewingThread = readThreadAncestors(commentsData);
  const actualRootPostId = useMemo(() => {
    const root = commentsData?.root;
    if (!root?.post_id) return null;
    if (isViewingComment) return viewingThread.rootPostId ?? root.root_post_id;
    return root.post_id;
  }, [commentsData?.root, isViewingComment, viewingThread.rootPostId]);
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
    // Match the web thread flow: the focused comment response already carries
    // its ancestors and subtree. Fetch the root thread only after the user
    // explicitly asks to leave the focused view and show the full thread.
    enabled:
      isFocused &&
      isViewingComment &&
      !showFocusedThread &&
      !!actualRootPostId,
  });
  // The response that carries the focused comment's ancestor chain: when the
  // route id IS the comment that is `commentsData`, otherwise it is the
  // separately-fetched highlighted comment.
  const focusedThread = readThreadAncestors(
    isViewingComment ? commentsData : focusedCommentData,
  );

  // Root post, ancestor chain, and reply subtree all arrive together. These are
  // plain derivations of one response — no state, no effects, no second fetch.
  const actualRootPost = useMemo(() => {
    if (!actualRootPostId) return null;
    if (!isViewingComment && commentsData?.root?.post_id) return commentsData.root;
    return focusedThread.rootPost;
  }, [actualRootPostId, commentsData?.root, focusedThread.rootPost, isViewingComment]);

  const contextDepth = useMemo(() => {
    if (!depth) return focusedCommentId ? 5 : 0;
    const parsed = Number(depth);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return Math.min(parsed, 5);
  }, [depth, focusedCommentId]);

  const contextComments = useMemo(() => {
    if (!focusedCommentId || contextDepth <= 0) return [];
    return focusedThread.parentChain;
  }, [contextDepth, focusedCommentId, focusedThread.parentChain]);

  useEffect(() => {
    setShowFocusedThread(true);
  }, [id, highlight, depth]);

  // How many ancestors exist above the focused comment, including any the node
  // elided. Drives the "N more replies above" affordance.
  const focusedContextAvailableCount = useMemo(() => {
    if (!focusedCommentId) return 0;
    return focusedThread.parentChain.length + focusedThread.omitted;
  }, [focusedCommentId, focusedThread.omitted, focusedThread.parentChain]);

  // The ancestor picture is settled the moment the thread response lands.
  const isFocusedContextSettled = focusedThread.resolved;

  return {
    actualRootPost,
    actualRootPostId,
    contextComments,
    contextDepth,
    focusedCommentData,
    focusedCommentId,
    focusedContextAvailableCount,
    isFocusedContextSettled,
    fullThreadCommentsData,
    hasLoadedFocusedContext: focusedThread.resolved,
    highlightCommentId,
    isLoadingContext: !!focusedCommentId && !focusedThread.resolved,
    isFocusedCommentNotFound,
    isLoadingFocusedComment,
    isLoadingFullThreadComments,
    optimisticThreadId,
    setShowFocusedThread,
    showFocusedThread,
  };
}
