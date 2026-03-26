import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect } from "react";

import type { Comment, ReportSheetRef, Post } from "@/src/components/molecules";
import type { UseBlockHandlerReturn } from "@/src/hooks/use-block-handler";
import type { UseDeleteHandlerReturn } from "@/src/hooks/use-delete-handler";
import type { UseReportHandlerReturn } from "@/src/hooks/use-report-handler";

type ToastApi = {
  info: (title: string, message?: string) => void;
};

type RouterApi = {
  back: () => void;
};

type UsePostDetailModerationParams = {
  deleteHandler: UseDeleteHandlerReturn;
  blockHandler: UseBlockHandlerReturn;
  reportHandler: UseReportHandlerReturn;
  reportSheetRef: RefObject<ReportSheetRef | null>;
  selectedComment: Comment | null;
  displayPost: Post | null;
  commentsRootUserId?: string;
  followedUsers: string[];
  highlight?: string;
  isMountedRef: RefObject<boolean>;
  toast: ToastApi;
  router: RouterApi;
  removeCommentFromState: (commentId: string) => void;
  globalHidePost: (postId: string) => void;
  globalHideComment: (commentId: string) => void;
  globalBlockUser: (userId: string) => void;
  setHiddenCommentIds: Dispatch<SetStateAction<Set<string>>>;
  setBlockedUserIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedComment: Dispatch<SetStateAction<Comment | null>>;
  onFollowCommentAuthor: (authorId: string, isCurrentlyFollowing: boolean) => void;
};

export function usePostDetailModeration({
  deleteHandler,
  blockHandler,
  reportHandler,
  reportSheetRef,
  selectedComment,
  displayPost,
  commentsRootUserId,
  followedUsers,
  highlight,
  isMountedRef,
  toast,
  router,
  removeCommentFromState,
  globalHidePost,
  globalHideComment,
  globalBlockUser,
  setHiddenCommentIds,
  setBlockedUserIds,
  setSelectedComment,
  onFollowCommentAuthor,
}: UsePostDetailModerationParams) {
  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending) {
      if (pending.type === "post") {
        globalHidePost(pending.id);
        if (isMountedRef.current) {
          router.back();
        }
      } else {
        globalHideComment(pending.id);
        setHiddenCommentIds((prev) => new Set(prev).add(pending.id));
        removeCommentFromState(pending.id);

        if (highlight && pending.id === highlight && isMountedRef.current) {
          router.back();
        }
      }
      setSelectedComment(null);
    }
    deleteHandler.confirmDelete();
  }, [
    deleteHandler,
    globalHideComment,
    globalHidePost,
    highlight,
    isMountedRef,
    removeCommentFromState,
    router,
    setHiddenCommentIds,
    setSelectedComment,
  ]);

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending) {
      if (pending.type === "post") {
        globalHidePost(pending.id);
        if (isMountedRef.current) {
          router.back();
        }
      } else if (pending.type === "user") {
        globalBlockUser(pending.id);
        const isPostAuthor = commentsRootUserId === pending.id;
        if (isPostAuthor) {
          if (isMountedRef.current) {
            router.back();
          }
        } else {
          setBlockedUserIds((prev) => new Set(prev).add(pending.id));
        }
      } else if (pending.type === "comment") {
        globalHideComment(pending.id);
        setHiddenCommentIds((prev) => new Set(prev).add(pending.id));
      }
      setSelectedComment(null);
    }
    blockHandler.confirmBlock();
  }, [
    blockHandler,
    commentsRootUserId,
    globalBlockUser,
    globalHideComment,
    globalHidePost,
    isMountedRef,
    router,
    setBlockedUserIds,
    setHiddenCommentIds,
    setSelectedComment,
  ]);

  const handleReportSubmitWithOptimistic = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending) {
        if (pending.type === "post") {
          globalHidePost(pending.id);
          if (isMountedRef.current) {
            router.back();
          }
        } else if (pending.type === "comment") {
          globalHideComment(pending.id);
          setHiddenCommentIds((prev) => new Set(prev).add(pending.id));
        }
        setSelectedComment(null);
      }
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [
      globalHideComment,
      globalHidePost,
      isMountedRef,
      reportHandler,
      reportSheetRef,
      router,
      setHiddenCommentIds,
      setSelectedComment,
    ],
  );

  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet, reportSheetRef]);

  const handleDeleteComment = useCallback(() => {
    if (!selectedComment) return;

    if (
      selectedComment.id.startsWith("optimistic-") ||
      selectedComment.id.startsWith("local-")
    ) {
      toast.info(
        "Comment is still syncing",
        "Please try deleting again in a moment.",
      );
      return;
    }

    deleteHandler.requestDelete(selectedComment.id, "comment");
  }, [deleteHandler, selectedComment, toast]);

  const handleDeletePost = useCallback(() => {
    if (!displayPost) return;
    deleteHandler.requestDelete(displayPost.id, "post");
  }, [deleteHandler, displayPost]);

  const handleBlockPost = useCallback(() => {
    if (!displayPost) return;
    blockHandler.requestBlockPost(displayPost.id);
  }, [blockHandler, displayPost]);

  const handleBlockPostAuthor = useCallback(() => {
    if (!displayPost) return;
    blockHandler.requestBlockUser(displayPost.author.id, displayPost.author.username);
  }, [blockHandler, displayPost]);

  const handleReportPost = useCallback(() => {
    if (!displayPost) return;
    reportHandler.requestReport(displayPost.id, "post");
  }, [displayPost, reportHandler]);

  const handleBlockComment = useCallback(() => {
    if (!selectedComment) return;
    blockHandler.requestBlockComment(selectedComment.id);
  }, [blockHandler, selectedComment]);

  const handleBlockCommentAuthor = useCallback(() => {
    if (!selectedComment) return;
    blockHandler.requestBlockUser(
      selectedComment.author.id,
      selectedComment.author.username,
    );
  }, [blockHandler, selectedComment]);

  const handleReportComment = useCallback(() => {
    if (!selectedComment) return;
    reportHandler.requestReport(selectedComment.id, "comment");
  }, [reportHandler, selectedComment]);

  const handleToggleFollowCommentAuthor = useCallback(() => {
    if (!selectedComment) return;
    const authorId = selectedComment.author.id;
    const isCurrentlyFollowing = followedUsers.includes(authorId);
    onFollowCommentAuthor(authorId, isCurrentlyFollowing);
  }, [followedUsers, onFollowCommentAuthor, selectedComment]);

  return {
    handleConfirmDelete,
    handleConfirmBlock,
    handleReportSubmitWithOptimistic,
    handleDeleteComment,
    handleDeletePost,
    handleBlockPost,
    handleBlockPostAuthor,
    handleReportPost,
    handleBlockComment,
    handleBlockCommentAuthor,
    handleReportComment,
    handleToggleFollowCommentAuthor,
  };
}
