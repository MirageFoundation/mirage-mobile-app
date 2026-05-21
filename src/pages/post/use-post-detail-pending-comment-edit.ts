import * as Sentry from "@sentry/react-native";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { useEdit } from "@/src/api/write";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { composeCommentContent, resolveCommentMediaUrl } from "@/src/utils/comment-media";

type CommentEditOverrides = Record<string, string>;

type UsePostDetailPendingCommentEditParams = {
  id?: string;
  onEditedComment?: (commentId: string) => void;
  refetchComments: () => unknown;
  setCommentEditOverrides: Dispatch<SetStateAction<CommentEditOverrides>>;
};

export function usePostDetailPendingCommentEdit({
  id,
  onEditedComment,
  refetchComments,
  setCommentEditOverrides,
}: UsePostDetailPendingCommentEditParams) {
  const enqueue = usePowQueueStore((state) => state.enqueue);
  const pendingEdit = useCommentComposeStore((state) => state.pendingEdit);
  const clearPendingEdit = useCommentComposeStore((state) => state.clearPendingEdit);
  const editMutation = useEdit({});
  const editMutateAsyncRef = useRef(editMutation.mutateAsync);

  useEffect(() => {
    editMutateAsyncRef.current = editMutation.mutateAsync;
  }, [editMutation.mutateAsync]);

  useEffect(() => {
    if (!pendingEdit || pendingEdit.postId !== id || pendingEdit.source !== "post") return;

    const { commentId, parentId, text, imageUri, gifUrl } = pendingEdit;
    clearPendingEdit();

    if (!commentId || commentId.startsWith("optimistic-")) return;

    const optimisticContent = composeCommentContent(text, imageUri || gifUrl || null);

    setCommentEditOverrides((prev) => ({
      ...prev,
      [commentId]: optimisticContent,
    }));
    onEditedComment?.(commentId);

    const actionId = generateActionId();
    enqueue({
      id: actionId,
      type: "edit",
      label: getActionLabel("edit"),
      execute: async () => {
        const mediaUrl = await resolveCommentMediaUrl(imageUri, gifUrl);
        const finalContent = composeCommentContent(text, mediaUrl);

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
      onError: (err) => {
        Sentry.captureException(err, {
          tags: { feature: "comment", operation: "edit_comment" },
          extra: {
            commentId,
            parentId,
            hadImage: !!imageUri,
            hadGif: !!gifUrl,
            contentLength: text.length,
          },
        });
        setCommentEditOverrides((prev) => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });
      },
    });
  }, [
    clearPendingEdit,
    enqueue,
    id,
    onEditedComment,
    pendingEdit,
    refetchComments,
    setCommentEditOverrides,
  ]);
}
