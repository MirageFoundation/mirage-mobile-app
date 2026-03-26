import type { RefObject } from "react";
import { useCallback, useEffect } from "react";

import type {
  Comment,
  CommentInputRef,
  CommentOptionsSheetRef,
  Post,
} from "@/src/components/molecules";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import {
  buildAnnotateParams,
  buildCommentEditParams,
  buildContentWithOptionalMedia,
  buildPostEditParams,
  createOptimisticComment,
  removeLocalComment,
  removeOptimisticReply,
  replaceLocalCommentId,
  replaceOptimisticReplyId,
} from "./post-detail-action-utils";

type RouterApi = {
  push: (args: any) => void;
};

type CurrentUser = {
  id: string;
  username: string | null;
} | null;

type CommentMutationResult = {
  tx_hash?: unknown;
};

type UsePostDetailCommentActionsParams = {
  id?: string;
  currentUser: CurrentUser;
  displayPost: Post | null;
  rootPostData?: { content?: string; tag?: string; timestamp?: number; media?: string[]; user_id?: string };
  replyingTo: Comment | null;
  requireAuth: (action: () => void) => void;
  router: RouterApi;
  commentInputRef: RefObject<CommentInputRef | null>;
  optionsSheetRef: RefObject<CommentOptionsSheetRef | null>;
  commentMutateAsyncRef: RefObject<(input: { parentId: string; content: string }) => Promise<CommentMutationResult>>;
  editMutateAsyncRef: RefObject<(input: { postId: string; parentId: string; title: string; content: string; tag: string }) => Promise<unknown>>;
  enqueue: (action: {
    id: string;
    type: string;
    label: string;
    execute: () => Promise<unknown>;
    onOptimisticUpdate?: () => void;
    onSuccess?: (result: any) => void;
    onError?: () => void;
    onRollback?: () => void;
  }) => void;
  generateActionId: () => string;
  getActionLabel: (type: string) => string;
  uploadImageAndGetUrl: (uri: string) => Promise<string>;
  refetchComments: () => Promise<unknown>;
  refetchCommentsRef: RefObject<((silent?: boolean) => void) | null>;
  setReplyingTo: React.Dispatch<React.SetStateAction<Comment | null>>;
  setSelectedComment: React.Dispatch<React.SetStateAction<Comment | null>>;
  setLocalComments: React.Dispatch<React.SetStateAction<Comment[]>>;
  setOptimisticReplies: React.Dispatch<React.SetStateAction<Record<string, Comment[]>>>;
  setLocalPostUpdates: React.Dispatch<React.SetStateAction<Partial<Post>>>;
  setCommentEditOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  incrementCommentCount: (postId: string) => void;
  decrementCommentCount: (postId: string) => void;
};

export function usePostDetailCommentActions({
  id,
  currentUser,
  displayPost,
  rootPostData,
  replyingTo,
  requireAuth,
  router,
  commentInputRef,
  optionsSheetRef,
  commentMutateAsyncRef,
  editMutateAsyncRef,
  enqueue,
  generateActionId,
  getActionLabel,
  uploadImageAndGetUrl,
  refetchComments,
  refetchCommentsRef,
  setReplyingTo,
  setSelectedComment,
  setLocalComments,
  setOptimisticReplies,
  setLocalPostUpdates,
  setCommentEditOverrides,
  incrementCommentCount,
  decrementCommentCount,
}: UsePostDetailCommentActionsParams) {
  const pendingComment = useCommentComposeStore((s) => s.pendingComment);
  const pendingEdit = useCommentComposeStore((s) => s.pendingEdit);
  const clearPendingEdit = useCommentComposeStore((s) => s.clearPendingEdit);
  const wasDismissed = useCommentComposeStore((s) => s.wasDismissed);
  const setWasDismissed = useCommentComposeStore((s) => s.setWasDismissed);

  const handleReplyToComment = useCallback(
    (comment: Comment) => {
      requireAuth(() => {
        setReplyingTo(comment);
        setTimeout(() => {
          commentInputRef.current?.activate();
        }, 100);
      });
    },
    [commentInputRef, requireAuth, setReplyingTo],
  );

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, [setReplyingTo]);

  const handleMoreOptions = useCallback(
    (comment: Comment) => {
      setSelectedComment(comment);
      optionsSheetRef.current?.present();
    },
    [optionsSheetRef, setSelectedComment],
  );

  const handleSubmitComment = useCallback(
    async (text: string, imageUri?: string | null, gifUrl?: string | null) => {
      if (!currentUser || !id) {
        return;
      }

      const parentId = replyingTo?.id ?? id;
      const optimisticMediaUrl = imageUri || gifUrl || null;
      const optimisticContent = buildContentWithOptionalMedia(text, optimisticMediaUrl);
      const optimisticCommentId = `optimistic-${Date.now()}`;
      const optimisticComment = createOptimisticComment({
        optimisticCommentId,
        currentUser,
        content: optimisticContent,
        parentId: replyingTo?.id ?? null,
      });

      const replyTarget = replyingTo;
      const capturedImageUri = imageUri;
      const capturedGifUrl = gifUrl;
      const capturedText = text;

      setReplyingTo(null);

      const actionId = generateActionId();
      enqueue({
        id: actionId,
        type: "comment",
        label: getActionLabel("comment"),
        execute: async () => {
          let mediaUrl: string | null = null;
          if (capturedImageUri) {
            mediaUrl = await uploadImageAndGetUrl(capturedImageUri);
          } else if (capturedGifUrl) {
            mediaUrl = capturedGifUrl;
          }

          const finalContent = buildContentWithOptionalMedia(capturedText, mediaUrl);

          return commentMutateAsyncRef.current({
            parentId,
            content: finalContent,
          });
        },
        onOptimisticUpdate: () => {
          if (replyTarget) {
            setOptimisticReplies((prev) => ({
              ...prev,
              [replyTarget.id]: [
                ...(prev[replyTarget.id] ?? []),
                optimisticComment,
              ],
            }));
          } else {
            setLocalComments((prev) => [optimisticComment, ...prev]);
          }
          setLocalPostUpdates((prev) => ({
            ...prev,
            comments: (prev.comments ?? displayPost?.comments ?? 0) + 1,
          }));
          incrementCommentCount(id);
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

          if (replyTarget) {
            setOptimisticReplies((prev) =>
              replaceOptimisticReplyId({
                repliesByParent: prev,
                replyTargetId: replyTarget.id,
                optimisticCommentId,
                confirmedCommentId,
              }),
            );
          } else {
            setLocalComments((prev) =>
              replaceLocalCommentId(prev, optimisticCommentId, confirmedCommentId),
            );
          }

          setSelectedComment((prev) => {
            if (!prev || prev.id !== optimisticCommentId) return prev;
            return { ...prev, id: confirmedCommentId };
          });

          setTimeout(() => {
            refetchCommentsRef.current?.(true);
          }, 2000);
        },
        onError: () => {},
        onRollback: () => {
          if (replyTarget) {
            setOptimisticReplies((prev) =>
              removeOptimisticReply({
                repliesByParent: prev,
                replyTargetId: replyTarget.id,
                optimisticCommentId,
              }),
            );
          } else {
            setLocalComments((prev) => removeLocalComment(prev, optimisticCommentId));
          }
          setLocalPostUpdates((prev) => ({
            ...prev,
            comments: Math.max(0, (prev.comments ?? displayPost?.comments ?? 0) - 1),
          }));
          decrementCommentCount(id);
        },
      });
    },
    [
      commentMutateAsyncRef,
      currentUser,
      decrementCommentCount,
      displayPost?.comments,
      enqueue,
      generateActionId,
      getActionLabel,
      id,
      incrementCommentCount,
      refetchCommentsRef,
      replyingTo,
      setLocalComments,
      setLocalPostUpdates,
      setOptimisticReplies,
      setReplyingTo,
      setSelectedComment,
      uploadImageAndGetUrl,
    ],
  );

  useEffect(() => {
    if (wasDismissed) {
      setReplyingTo(null);
      setWasDismissed(false);
    }
  }, [setReplyingTo, setWasDismissed, wasDismissed]);

  useEffect(() => {
    if (!pendingComment || pendingComment.postId !== id) return;
    const current = useCommentComposeStore.getState().pendingComment;
    if (!current || current.postId !== id) return;
    useCommentComposeStore.getState().clearPendingComment();
    handleSubmitComment(current.text, current.imageUri, current.gifUrl);
  }, [handleSubmitComment, id, pendingComment]);

  useEffect(() => {
    if (pendingEdit && pendingEdit.postId === id && pendingEdit.source === "post") {
      const { commentId, parentId, text, imageUri, gifUrl } = pendingEdit;
      clearPendingEdit();

      if (!commentId || commentId.startsWith("optimistic-")) return;

      const finalContent = buildContentWithOptionalMedia(text, imageUri || gifUrl);

      setCommentEditOverrides((prev) => ({
        ...prev,
        [commentId]: finalContent,
      }));

      const actionId = generateActionId();
      enqueue({
        id: actionId,
        type: "edit",
        label: getActionLabel("edit"),
        execute: async () => {
          return editMutateAsyncRef.current({
            postId: commentId,
            parentId,
            title: "",
            content: finalContent,
            tag: "",
          });
        },
        onSuccess: () => {
          setTimeout(async () => {
            await refetchComments();
            setCommentEditOverrides((prev) => {
              const next = { ...prev };
              delete next[commentId];
              return next;
            });
          }, 3000);
        },
        onError: () => {
          setCommentEditOverrides((prev) => {
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        },
      });
    }
  }, [
    clearPendingEdit,
    editMutateAsyncRef,
    enqueue,
    generateActionId,
    getActionLabel,
    id,
    pendingEdit,
    refetchComments,
    setCommentEditOverrides,
  ]);

  const handleEditComment = () => {
    if (!selectedComment || !id || selectedComment.id.startsWith("optimistic-")) {
      return;
    }

    const params = buildCommentEditParams({
      postId: id,
      selectedComment,
      displayPost,
    });
    router.push({ pathname: "/comment-compose", params });
  };

  const handleEditPost = useCallback(() => {
    if (!displayPost) return;
    const editParams = buildPostEditParams(displayPost, rootPostData);
    router.push({ pathname: "/edit-post", params: editParams });
  }, [displayPost, rootPostData, router]);

  const handleAnnotatePost = useCallback(() => {
    if (!displayPost) return;
    const annotateParams = buildAnnotateParams(displayPost, rootPostData);
    router.push({ pathname: "/annotate", params: annotateParams });
  }, [displayPost, rootPostData, router]);

  return {
    handleReplyToComment,
    handleCancelReply,
    handleMoreOptions,
    handleSubmitComment,
    handleEditComment,
    handleEditPost,
    handleAnnotatePost,
  };
}
