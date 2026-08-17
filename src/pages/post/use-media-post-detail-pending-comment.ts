import { type MutableRefObject, useEffect } from "react";
import * as Sentry from "@sentry/react-native";

import { useComment } from "@/src/api/write/hooks/use-post";
import { composeCommentContent, resolveCommentMediaUrl } from "@/src/utils/comment-media";
import { type Comment } from "@/src/components/molecules";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";
import { useAuthStore } from "@/src/stores";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { usePostCommentOptimisticStore } from "@/src/stores/post-comment-optimistic-store";

type FocusedMode = "single" | "context" | "full";

type UseMediaPostDetailPendingCommentOptions = {
  collapseMedia: () => void;
  revealCommentsAfterPost?: (commentId: string, isReply: boolean) => void;
  focusedCommentId: string | null;
  focusedMode: FocusedMode;
  highlightTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  id: string | undefined;
  pendingReplyScrollIdRef: MutableRefObject<string | null>;
  refetchComments: () => unknown;
  setFocusedMode: (mode: FocusedMode) => void;
  setHighlightedCommentId: (commentId: string | null | ((prev: string | null) => string | null)) => void;
  suppressedHighlightScrollRef: MutableRefObject<string | null>;
  onConfirmedCommentId?: (optimisticId: string, confirmedId: string) => void;
};

export function useMediaPostDetailPendingComment({
  collapseMedia,
  revealCommentsAfterPost,
  focusedCommentId,
  focusedMode,
  highlightTimerRef,
  id,
  pendingReplyScrollIdRef,
  refetchComments,
  setFocusedMode,
  setHighlightedCommentId,
  suppressedHighlightScrollRef,
  onConfirmedCommentId,
}: UseMediaPostDetailPendingCommentOptions) {
  const currentUser = useAuthStore((state) => state.user);
  const enqueue = usePowQueueStore((state) => state.enqueue);
  const commentMutation = useComment({});
  const pendingComment = useCommentComposeStore((state) => state.pendingComment);
  const addTopLevelOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.addTopLevelComment,
  );
  const addReplyOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.addReplyComment,
  );
  const replaceOptimisticCommentId = usePostCommentOptimisticStore(
    (state) => state.replaceCommentId,
  );
  const removeOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.removeComment,
  );

  useEffect(() => {
    if (!pendingComment || !id || pendingComment.postId !== id || !currentUser) return;
    const captured = useCommentComposeStore.getState().consumePendingComment(id);
    if (!captured) {
      Sentry.addBreadcrumb({
        category: "comment",
        message: "Pending media comment already consumed",
        level: "info",
        data: { postId: id },
      });
      return;
    }

    const parentId = captured.replyToId ?? id;
    const optimisticMediaUrl = captured.imageUri || captured.gifUrl || null;
    const capturedText = captured.text ?? "";
    const optimisticContent = composeCommentContent(capturedText, optimisticMediaUrl);

    const optimisticCommentId = `optimistic-${Date.now()}`;
    const optimisticComment: Comment = {
      id: optimisticCommentId,
      author: {
        id: currentUser.id,
        username: currentUser.username ?? "you",
        avatarSeed: currentUser.walletAddress ?? currentUser.id,
      },
      content: optimisticContent,
      likes: 1,
      dislikes: 0,
      hasLiked: true,
      hasDisliked: false,
      createdAt: new Date(),
      replyCount: 0,
      parentId,
    };

    const actionId = generateActionId();
    Sentry.addBreadcrumb({
      category: "comment",
      message: "Media comment action enqueued",
      level: "info",
      data: {
        postId: id,
        parentId,
        isReply: !!captured.replyToId,
        hasImage: !!captured.imageUri,
        hasGif: !!captured.gifUrl,
        actionId,
        optimisticCommentId,
      },
    });
    enqueue({
      id: actionId,
      type: "comment",
      label: getActionLabel("comment"),
      execute: async () => {
        const mediaUrl = await resolveCommentMediaUrl(captured.imageUri, captured.gifUrl);
        const finalContent = composeCommentContent(capturedText, mediaUrl);

        return commentMutation.mutateAsync({ parentId, content: finalContent, rootPostId: id });
      },
      onOptimisticUpdate: () => {
        // Composer reveal owns the only scroll. Keep highlight/layout
        // auto-scrolls suppressed so they cannot race it.
        suppressedHighlightScrollRef.current = optimisticCommentId;
        if (captured.replyToId) {
          addReplyOptimisticComment(id, captured.replyToId, optimisticComment);
          pendingReplyScrollIdRef.current = optimisticCommentId;
        } else {
          addTopLevelOptimisticComment(id, optimisticComment);
          if (focusedCommentId && focusedMode !== "full") {
            setFocusedMode("full");
          }
          pendingReplyScrollIdRef.current = optimisticCommentId;
        }
        setHighlightedCommentId(optimisticCommentId);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
        console.log("[CommentReveal] optimistic comment inserted", {
          postId: id,
          optimisticCommentId,
          isReply: !!captured.replyToId,
          parentId,
        });
        if (revealCommentsAfterPost) {
          revealCommentsAfterPost(optimisticCommentId, !!captured.replyToId);
        }
        else collapseMedia();
        Sentry.addBreadcrumb({
          category: "comment",
          message: "Optimistic comment added to media post",
          level: "info",
          data: {
            postId: id,
            parentId,
            isReply: !!captured.replyToId,
            optimisticCommentId,
          },
        });
      },
      onSuccess: (result) => {
        const confirmedCommentId =
          typeof result === "object" &&
          result !== null &&
          "tx_hash" in result &&
          typeof (result as { tx_hash?: unknown }).tx_hash === "string"
            ? (result as { tx_hash: string }).tx_hash
            : null;
        if (confirmedCommentId) {
          replaceOptimisticCommentId(id, optimisticCommentId, confirmedCommentId);
          suppressedHighlightScrollRef.current = confirmedCommentId;
          pendingReplyScrollIdRef.current = confirmedCommentId;
          setHighlightedCommentId((prev) =>
            prev === optimisticCommentId ? confirmedCommentId : prev,
          );
          onConfirmedCommentId?.(optimisticCommentId, confirmedCommentId);
          Sentry.addBreadcrumb({
            category: "comment",
            message: "Optimistic comment confirmed",
            level: "info",
            data: {
              postId: id,
              optimisticCommentId,
              confirmedCommentId,
            },
          });
        } else {
          Sentry.captureMessage(
            "Comment mutation succeeded without tx_hash on media post",
            {
              level: "warning",
              tags: { feature: "comment", operation: "submit_comment_media_detail" },
              extra: {
                postId: id,
                parentId,
                optimisticCommentId,
                resultType: typeof result,
              },
            },
          );
        }
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
        setTimeout(() => refetchComments(), 2000);
      },
      onError: (err) => {
        Sentry.captureException(err, {
          tags: { feature: "comment", operation: "submit_comment_media_detail" },
          extra: {
            parentId,
            hadImage: !!captured.imageUri,
            hadGif: !!captured.gifUrl,
            contentLength: capturedText.length,
          },
        });
      },
      onRollback: () => {
        removeOptimisticComment(id, optimisticCommentId);
      },
    });
  }, [
    pendingComment,
    id,
    focusedCommentId,
    focusedMode,
    currentUser,
    commentMutation,
    refetchComments,
    addReplyOptimisticComment,
    addTopLevelOptimisticComment,
    replaceOptimisticCommentId,
    removeOptimisticComment,
    collapseMedia,
    revealCommentsAfterPost,
    enqueue,
    setFocusedMode,
    setHighlightedCommentId,
    suppressedHighlightScrollRef,
    onConfirmedCommentId,
    pendingReplyScrollIdRef,
    highlightTimerRef,
  ]);
}
