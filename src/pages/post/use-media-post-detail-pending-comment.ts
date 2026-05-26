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
  revealCommentsAfterPost?: () => void;
  focusedCommentId: string | null;
  focusedMode: FocusedMode;
  highlightTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  id: string | undefined;
  pendingReplyScrollIdRef: MutableRefObject<string | null>;
  pendingScrollToEndRef: MutableRefObject<boolean>;
  refetchComments: () => unknown;
  setFocusedMode: (mode: FocusedMode) => void;
  setHighlightedCommentId: (commentId: string | null | ((prev: string | null) => string | null)) => void;
  suppressedHighlightScrollRef: MutableRefObject<string | null>;
};

export function useMediaPostDetailPendingComment({
  collapseMedia,
  revealCommentsAfterPost,
  focusedCommentId,
  focusedMode,
  highlightTimerRef,
  id,
  pendingReplyScrollIdRef,
  pendingScrollToEndRef,
  refetchComments,
  setFocusedMode,
  setHighlightedCommentId,
  suppressedHighlightScrollRef,
}: UseMediaPostDetailPendingCommentOptions) {
  const currentUser = useAuthStore((state) => state.user);
  const enqueue = usePowQueueStore((state) => state.enqueue);
  const commentMutation = useComment({});
  const pendingComment = useCommentComposeStore((state) => state.pendingComment);
  const clearPendingComment = useCommentComposeStore((state) => state.clearPendingComment);
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
    const captured = pendingComment;
    clearPendingComment();

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
        if (captured.replyToId) {
          suppressedHighlightScrollRef.current = null;
          addReplyOptimisticComment(id, captured.replyToId, optimisticComment);
          pendingReplyScrollIdRef.current = optimisticCommentId;
        } else {
          suppressedHighlightScrollRef.current = null;
          addTopLevelOptimisticComment(id, optimisticComment);
          if (focusedCommentId && focusedMode !== "full") {
            setFocusedMode("full");
          }
          pendingReplyScrollIdRef.current = optimisticCommentId;
          pendingScrollToEndRef.current = true;
        }
        setHighlightedCommentId(optimisticCommentId);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
        if (revealCommentsAfterPost) revealCommentsAfterPost();
        else collapseMedia();
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
          suppressedHighlightScrollRef.current = null;
          pendingReplyScrollIdRef.current = confirmedCommentId;
          setHighlightedCommentId((prev) =>
            prev === optimisticCommentId ? confirmedCommentId : prev,
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
    clearPendingComment,
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
    pendingReplyScrollIdRef,
    pendingScrollToEndRef,
    highlightTimerRef,
  ]);
}
