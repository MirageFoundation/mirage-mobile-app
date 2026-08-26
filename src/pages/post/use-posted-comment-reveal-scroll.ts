import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { InteractionManager } from "react-native";

import type { Comment } from "@/src/components/molecules";

import {
  decidePostedCommentReveal,
  POSTED_COMMENT_REVEAL_TIMEOUT_MS,
  shouldScrollPostedCommentToEnd,
  type PostedCommentReveal,
} from "./post-detail-comment-reveal";

const REVEAL_READY_FALLBACK_MS = 1800;

type UsePostedCommentRevealScrollOptions = {
  alreadyScrolledIdRef: RefObject<string | null>;
  comments: Comment[];
  epoch: number;
  feature: "post-detail" | "media-post-detail";
  pendingRef: RefObject<PostedCommentReveal | null>;
  postId?: string;
  ready?: boolean;
  scrollToEnd?: (contentHeight?: number) => void;
  scrollToIndex: (index: number) => void;
};

export function usePostedCommentRevealScroll({
  alreadyScrolledIdRef,
  comments,
  epoch,
  feature,
  pendingRef,
  postId,
  ready = true,
  scrollToEnd,
  scrollToIndex,
}: UsePostedCommentRevealScrollOptions) {
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const lastContentHeightRef = useRef<number | undefined>(undefined);
  const [readyFallback, setReadyFallback] = useState(false);

  useEffect(() => {
    setReadyFallback(false);
    if (ready || epoch === 0) return;
    const timer = setTimeout(() => setReadyFallback(true), REVEAL_READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [epoch, ready]);

  const surfaceReady = ready || readyFallback;

  const tryReveal = useCallback((contentHeight?: number) => {
    if (contentHeight && contentHeight > 0) {
      lastContentHeightRef.current = contentHeight;
    }
    const pending = pendingRef.current;
    const currentComments = commentsRef.current;
    const measuredHeight = contentHeight ?? lastContentHeightRef.current;
    const decision = decidePostedCommentReveal({
      pending,
      comments: currentComments,
      alreadyScrolledId: alreadyScrolledIdRef.current,
      ready: readyRef.current || readyFallback,
    });
    console.log("[CommentReveal] tryReveal", {
      feature,
      pendingId: pending?.id ?? null,
      alreadyScrolledId: alreadyScrolledIdRef.current,
      ready: readyRef.current,
      readyFallback,
      commentCount: currentComments.length,
      contentHeight: measuredHeight ?? null,
      decision,
      hasListScrollToEnd: !!scrollToEnd,
    });
    if (decision.type === "timeout") {
      pendingRef.current = null;
      Sentry.captureMessage("Posted comment reveal timed out", {
        level: "warning",
        tags: { feature, operation: "scroll-after-comment-post" },
        extra: {
          postId,
          commentId: pending?.id,
          topLevelCount: currentComments.length,
          ready: readyRef.current || readyFallback,
        },
      });
      return false;
    }
    if (decision.type !== "scroll") return false;

    // Only lock the reveal after the real surface is ready. A fallback
    // scroll during the sheet animation is allowed, but must not prevent
    // a second scroll once snap 2 settles.
    if (readyRef.current) {
      alreadyScrolledIdRef.current = decision.commentId;
      pendingRef.current = null;
    }
    Sentry.addBreadcrumb({
      category: feature,
      message: "Scrolling once to newly posted comment",
      level: "info",
      data: {
        postId,
        commentId: decision.commentId,
        topLevelIndex: decision.index,
        commentCount: currentComments.length,
        contentHeight: measuredHeight ?? null,
      },
    });
    if (scrollToEnd && shouldScrollPostedCommentToEnd(decision.index, currentComments.length)) {
      console.log("[CommentReveal] scrolling to end", {
        feature,
        commentId: decision.commentId,
        index: decision.index,
        contentHeight: measuredHeight ?? null,
        locked: readyRef.current,
      });
      scrollToEnd(measuredHeight);
    } else {
      console.log("[CommentReveal] scrolling to index", {
        feature,
        commentId: decision.commentId,
        index: decision.index,
      });
      scrollToIndex(decision.index);
    }
    return true;
  }, [
    alreadyScrolledIdRef,
    feature,
    pendingRef,
    postId,
    readyFallback,
    scrollToEnd,
    scrollToIndex,
  ]);

  useEffect(() => {
    console.log("[CommentReveal] schedule", {
      feature,
      epoch,
      pendingId: pendingRef.current?.id ?? null,
      surfaceReady,
      ready: readyRef.current,
      readyFallback,
      commentCount: commentsRef.current.length,
    });
    if (!pendingRef.current || !surfaceReady) return;

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      console.log("[CommentReveal] afterInteractions", { feature, cancelled });
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (!cancelled) tryReveal();
      });
    });
    const timeoutTimer = setTimeout(() => {
      if (cancelled || !pendingRef.current) return;
      tryReveal();
    }, POSTED_COMMENT_REVEAL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      task.cancel();
      clearTimeout(timeoutTimer);
    };
  }, [epoch, feature, pendingRef, readyFallback, surfaceReady, tryReveal]);

  return tryReveal;
}
