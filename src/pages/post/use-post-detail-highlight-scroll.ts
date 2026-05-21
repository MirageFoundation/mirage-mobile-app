import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  type LayoutChangeEvent,
  UIManager,
} from "react-native";

import type { Comment } from "@/src/components/molecules";

import { findCommentInTree } from "./post-detail-comment-utils";
import type { PostDetailCommentsSectionRef } from "./post-detail-comments-section";

type RefetchComments = (silent?: boolean) => void;

type UsePostDetailHighlightScrollParams = {
  allComments: Comment[];
  commentsSectionRef: RefObject<PostDetailCommentsSectionRef | null>;
  contextDepth: number;
  focusedCommentId?: string | null;
  highlight?: string;
  id?: string;
  insetsTop: number;
  isFetchingComments: boolean;
  isLoadingComments: boolean;
  isLoadingContext: boolean;
  lastCommentsFetchRef: RefObject<number>;
  refetchCommentsRef: RefObject<RefetchComments | null>;
};

export function usePostDetailHighlightScroll({
  allComments,
  commentsSectionRef,
  contextDepth,
  focusedCommentId,
  highlight,
  id,
  insetsTop,
  isFetchingComments,
  isLoadingComments,
  isLoadingContext,
  lastCommentsFetchRef,
  refetchCommentsRef,
}: UsePostDetailHighlightScrollParams) {
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(
    highlight || null,
  );
  const allCommentsLengthRef = useRef(0);
  const currentScrollYRef = useRef(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightRetryCount = useRef(0);
  const missingHighlightReportedRef = useRef<string | null>(null);
  const pendingScrollToEnd = useRef(false);
  const preciseScrollTargetRef = useRef<string | null>(null);
  const suppressedHighlightScrollRef = useRef<string | null>(null);

  allCommentsLengthRef.current = allComments.length;

  useEffect(() => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightRetryCount.current = 0;
    preciseScrollTargetRef.current = null;
    missingHighlightReportedRef.current = null;
    suppressedHighlightScrollRef.current = null;
    if (highlight) {
      Sentry.addBreadcrumb({
        category: "post-detail",
        message: "Post detail highlight target updated",
        level: "info",
        data: { postId: id, highlight },
      });
    }
    setHighlightedCommentId(highlight || null);
  }, [highlight, id]);

  useEffect(() => {
    if (focusedCommentId && !highlight) {
      setHighlightedCommentId(focusedCommentId);
    }
  }, [focusedCommentId, highlight]);

  const scrollCommentsToIndex = useCallback((index: number) => {
    if (index < 0 || index >= allCommentsLengthRef.current) return false;
    commentsSectionRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.1,
    });
    return true;
  }, [commentsSectionRef]);

  useEffect(() => {
    if (focusedCommentId && contextDepth > 0 && isLoadingContext) return;
    if (!highlightedCommentId || allComments.length === 0 || !commentsSectionRef.current) return;
    if (suppressedHighlightScrollRef.current === highlightedCommentId) return;

    let index = allComments.findIndex((comment) => comment.id === highlightedCommentId);

    if (index === -1) {
      index = allComments.findIndex((comment) =>
        findCommentInTree(comment, highlightedCommentId),
      );
    }

    if (index === -1 || index >= allComments.length) return;

    highlightRetryCount.current = 0;
    Sentry.addBreadcrumb({
      category: "post-detail",
      message: "Highlighted comment thread located",
      level: "info",
      data: {
        postId: id,
        highlight: highlightedCommentId,
        topLevelIndex: index,
        matchedTopLevel: allComments[index]?.id === highlightedCommentId,
        commentCount: allComments.length,
      },
    });

    const isFocusedChain =
      focusedCommentId && contextDepth > 0 &&
      allComments[index]?.id !== highlightedCommentId;

    setTimeout(() => {
      if (index < allCommentsLengthRef.current) {
        if (isFocusedChain) {
          commentsSectionRef.current?.scrollToEnd({ animated: true });
          return;
        }
        scrollCommentsToIndex(index);
      }
    }, 600);

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedCommentId(null);
    }, 6000);
  }, [
    allComments,
    commentsSectionRef,
    contextDepth,
    focusedCommentId,
    highlightedCommentId,
    id,
    isLoadingContext,
    scrollCommentsToIndex,
  ]);

  useEffect(() => {
    if (!highlight || !allComments || isLoadingComments || isFetchingComments) return;

    const found = allComments.some((comment) => findCommentInTree(comment, highlight));
    if (found) return;

    const maxHighlightRetries = 3;
    if (highlightRetryCount.current >= maxHighlightRetries) {
      if (missingHighlightReportedRef.current !== highlight) {
        missingHighlightReportedRef.current = highlight;
        Sentry.captureMessage("Post detail highlight comment not found", {
          level: "warning",
          tags: { feature: "inbox-highlight" },
          extra: {
            postId: id,
            highlight,
            topLevelCommentCount: allComments.length,
            retryCount: highlightRetryCount.current,
            isLoadingComments,
            isFetchingComments,
          },
        });
      }
      return;
    }

    const delay = (highlightRetryCount.current + 1) * 2000;
    const timer = setTimeout(() => {
      highlightRetryCount.current += 1;
      Sentry.addBreadcrumb({
        category: "post-detail",
        message: "Retrying comments fetch for missing highlight",
        level: "info",
        data: {
          postId: id,
          highlight,
          retryCount: highlightRetryCount.current,
        },
      });
      lastCommentsFetchRef.current = 0;
      refetchCommentsRef.current?.();
    }, delay);
    return () => clearTimeout(timer);
  }, [
    allComments,
    highlight,
    id,
    isFetchingComments,
    isLoadingComments,
    lastCommentsFetchRef,
    refetchCommentsRef,
  ]);

  const handleHighlightedCommentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!highlightedCommentId) return;
      if (suppressedHighlightScrollRef.current === highlightedCommentId) return;
      const target = (event.nativeEvent as { target?: number }).target;
      if (!target) return;
      const targetKey = `${highlightedCommentId}:${target}`;

      setTimeout(() => {
        UIManager.measureInWindow(target, (_x, y, _width, height) => {
          if (preciseScrollTargetRef.current === targetKey) return;
          if (height <= 0) return;

          const desiredY = insetsTop + 72;
          const delta = y - desiredY;
          if (Math.abs(delta) < 24) {
            preciseScrollTargetRef.current = targetKey;
            Sentry.addBreadcrumb({
              category: "post-detail",
              message: "Highlighted comment already near target position",
              level: "info",
              data: { postId: id, highlight: highlightedCommentId, y, delta },
            });
            return;
          }

          preciseScrollTargetRef.current = targetKey;
          Sentry.addBreadcrumb({
            category: "post-detail",
            message: "Adjusted scroll to highlighted comment",
            level: "info",
            data: {
              postId: id,
              highlight: highlightedCommentId,
              y,
              height,
              delta,
              currentScrollY: currentScrollYRef.current,
            },
          });
          commentsSectionRef.current?.scrollToOffset({
            offset: Math.max(0, currentScrollYRef.current + delta),
            animated: true,
          });
        });
      }, 900);
    },
    [commentsSectionRef, highlightedCommentId, id, insetsTop],
  );

  const handleContentSizeChange = useCallback(() => {
    if (pendingScrollToEnd.current) {
      pendingScrollToEnd.current = false;
      commentsSectionRef.current?.scrollToEnd({ animated: true });
    }
  }, [commentsSectionRef]);

  const handleComposerHighlight = useCallback((commentId: string, suppressScroll = false) => {
    suppressedHighlightScrollRef.current = suppressScroll ? commentId : null;
    setHighlightedCommentId(commentId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
  }, []);

  const handleComposerConfirmedCommentId = useCallback(
    (optimisticCommentId: string, confirmedCommentId: string) => {
      suppressedHighlightScrollRef.current = confirmedCommentId;
      setHighlightedCommentId((prev) =>
        prev === optimisticCommentId ? confirmedCommentId : prev,
      );
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
    },
    [],
  );

  const handleComposerScrollToEnd = useCallback(() => {
    pendingScrollToEnd.current = true;
  }, []);

  return {
    currentScrollYRef,
    handleComposerConfirmedCommentId,
    handleComposerHighlight,
    handleComposerScrollToEnd,
    handleContentSizeChange,
    handleHighlightedCommentLayout,
    highlightedCommentId,
  };
}
