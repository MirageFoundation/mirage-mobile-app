import * as Sentry from "@sentry/react-native";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { transformApiComment } from "@/src/api/read";
import { useComment } from "@/src/api/write";
import type { PostWithChildren } from "@/src/api/types";
import { Comment, CommentInput, type CommentInputRef, type Post } from "@/src/components/molecules";
import { composeCommentContent, resolveCommentMediaUrl } from "@/src/utils/comment-media";
import { markSeen } from "@/src/services/seen-posts";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";

type CurrentUser = {
  id: string;
  username?: string | null;
  walletAddress?: string | null;
};

export type PostDetailCommentComposerRef = {
  startReply: (comment: Comment) => void;
};

type PostDetailCommentComposerProps = {
  addReplyOptimisticComment: (threadId: string, parentId: string, comment: Comment) => void;
  addTopLevelOptimisticComment: (threadId: string, comment: Comment) => void;
  baseCommentCount: number;
  currentUser?: CurrentUser | null;
  decrementCommentCount: (postId: string, baseComments: number) => void;
  focusedCommentId?: string | null;
  id: string;
  implicitReplyRoot?: PostWithChildren | null;
  incrementCommentCount: (postId: string, baseComments: number) => void;
  isLoggedIn: boolean;
  isViewingComment: boolean;
  onAuthRequired: () => void;
  onClearFocusedThread: () => void;
  onCommentCountDelta: (delta: number, fallbackBase: number) => void;
  onConfirmedCommentId: (optimisticId: string, confirmedId: string) => void;
  onHighlightComment: (commentId: string, suppressScroll?: boolean) => void;
  onRefetchAfterSuccess: () => void;
  onScrollToEndAfterLayout: () => void;
  optimisticThreadId: string;
  post?: Post | null;
  removeOptimisticComment: (threadId: string, commentId: string) => void;
  replaceOptimisticCommentId: (threadId: string, optimisticId: string, confirmedId: string) => void;
  requireAuth: (action: () => void) => void;
  rootPostCommentCount: number;
  showFocusedThread: boolean;
};

export const PostDetailCommentComposer = forwardRef<
  PostDetailCommentComposerRef,
  PostDetailCommentComposerProps
>(
  (
    {
      addReplyOptimisticComment,
      addTopLevelOptimisticComment,
      baseCommentCount,
      currentUser,
      decrementCommentCount,
      focusedCommentId,
      id,
      implicitReplyRoot,
      incrementCommentCount,
      isLoggedIn,
      isViewingComment,
      onAuthRequired,
      onClearFocusedThread,
      onCommentCountDelta,
      onConfirmedCommentId,
      onHighlightComment,
      onRefetchAfterSuccess,
      onScrollToEndAfterLayout,
      optimisticThreadId,
      post,
      removeOptimisticComment,
      replaceOptimisticCommentId,
      requireAuth,
      rootPostCommentCount,
      showFocusedThread,
    },
    ref,
  ) => {
    const commentInputRef = useRef<CommentInputRef>(null);
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
    const commentMutation = useComment({});
    const commentMutateAsyncRef = useRef(commentMutation.mutateAsync);
    const enqueue = usePowQueueStore((state) => state.enqueue);
    const pendingComment = useCommentComposeStore((state) => state.pendingComment);
    const wasDismissed = useCommentComposeStore((state) => state.wasDismissed);
    const setWasDismissed = useCommentComposeStore((state) => state.setWasDismissed);

    useEffect(() => {
      commentMutateAsyncRef.current = commentMutation.mutateAsync;
    }, [commentMutation.mutateAsync]);

    useImperativeHandle(
      ref,
      () => ({
        startReply: (comment) => {
          requireAuth(() => {
            setReplyingTo(comment);
            setTimeout(() => {
              commentInputRef.current?.activate();
            }, 100);
          });
        },
      }),
      [requireAuth],
    );

    const handleCancelReply = useCallback(() => {
      setReplyingTo(null);
    }, []);

    const handleSubmitComment = useCallback(
      async (text: string, imageUri?: string | null, gifUrl?: string | null) => {
        if (!currentUser || !id) return;

        const implicitReplyTarget =
          !replyingTo && isViewingComment && implicitReplyRoot
            ? transformApiComment(implicitReplyRoot)
            : null;
        const parentId = replyingTo?.id ?? implicitReplyTarget?.id ?? id;
        const optimisticMediaUrl = imageUri || gifUrl || null;
        const optimisticContent = composeCommentContent(text, optimisticMediaUrl);
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

        const replyTarget = replyingTo ?? implicitReplyTarget;
        const capturedImageUri = imageUri;
        const capturedGifUrl = gifUrl;
        const capturedText = text;

        setReplyingTo(null);

        enqueue({
          id: generateActionId(),
          type: "comment",
          label: getActionLabel("comment"),
          execute: async () => {
            const mediaUrl = await resolveCommentMediaUrl(capturedImageUri, capturedGifUrl);
            const finalContent = composeCommentContent(capturedText, mediaUrl);

            return commentMutateAsyncRef.current({
              parentId,
              content: finalContent,
            });
          },
          onOptimisticUpdate: () => {
            if (replyTarget) {
              addReplyOptimisticComment(optimisticThreadId, replyTarget.id, optimisticComment);
            } else {
              addTopLevelOptimisticComment(optimisticThreadId, optimisticComment);
              if (focusedCommentId && showFocusedThread) {
                onClearFocusedThread();
              }
              onScrollToEndAfterLayout();
            }
            onHighlightComment(optimisticCommentId);
            onCommentCountDelta(1, baseCommentCount);
            incrementCommentCount(id, rootPostCommentCount);
          },
          onSuccess: (result) => {
            const confirmedCommentId =
              typeof result === "object" &&
              result !== null &&
              "tx_hash" in result &&
              typeof (result as { tx_hash?: unknown }).tx_hash === "string"
                ? (result as { tx_hash: string }).tx_hash
                : null;

            if (!confirmedCommentId) return;

            replaceOptimisticCommentId(optimisticThreadId, optimisticCommentId, confirmedCommentId);
            onConfirmedCommentId(optimisticCommentId, confirmedCommentId);

            setTimeout(() => {
              onRefetchAfterSuccess();
            }, 2000);
          },
          onError: (err) => {
            Sentry.captureException(err, {
              tags: { feature: "comment", operation: "submit_comment" },
              extra: {
                parentId,
                hadImage: !!capturedImageUri,
                hadGif: !!capturedGifUrl,
                contentLength: capturedText.length,
              },
            });
          },
          onRollback: () => {
            removeOptimisticComment(optimisticThreadId, optimisticCommentId);
            onCommentCountDelta(-1, baseCommentCount);
            decrementCommentCount(id, rootPostCommentCount);
          },
        });
      },
      [
        addReplyOptimisticComment,
        addTopLevelOptimisticComment,
        baseCommentCount,
        currentUser,
        decrementCommentCount,
        enqueue,
        focusedCommentId,
        id,
        implicitReplyRoot,
        incrementCommentCount,
        isViewingComment,
        onClearFocusedThread,
        onCommentCountDelta,
        onConfirmedCommentId,
        onHighlightComment,
        onRefetchAfterSuccess,
        onScrollToEndAfterLayout,
        optimisticThreadId,
        removeOptimisticComment,
        replaceOptimisticCommentId,
        replyingTo,
        rootPostCommentCount,
        showFocusedThread,
      ],
    );

    useEffect(() => {
      if (wasDismissed) {
        setReplyingTo(null);
        setWasDismissed(false);
      }
    }, [wasDismissed, setWasDismissed]);

    useEffect(() => {
      if (!pendingComment || pendingComment.postId !== id) return;
      const current = useCommentComposeStore.getState().pendingComment;
      if (!current || current.postId !== id) return;
      useCommentComposeStore.getState().clearPendingComment();
      markSeen(id, "reply");
      void handleSubmitComment(current.text, current.imageUri, current.gifUrl);
    }, [pendingComment, id, handleSubmitComment]);

    return (
      <CommentInput
        ref={commentInputRef}
        isLoggedIn={isLoggedIn}
        onAuthRequired={onAuthRequired}
        replyingTo={replyingTo?.author.username}
        replyingToId={replyingTo?.id}
        replyingToContent={replyingTo?.content}
        onCancelReply={handleCancelReply}
        postId={id}
        postTitle={post?.title}
        postAuthorUsername={post?.author.username}
        postThumbnail={post?.media?.[0]?.uri}
        postContent={post?.body}
      />
    );
  },
);

PostDetailCommentComposer.displayName = "PostDetailCommentComposer";
