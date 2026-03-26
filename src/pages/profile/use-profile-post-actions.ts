import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect } from "react";

import type { Post, PostOptionsSheetRef, ReportSheetRef } from "@/src/components/molecules";
import type { UseBlockHandlerReturn } from "@/src/hooks/use-block-handler";
import type { UseDeleteHandlerReturn } from "@/src/hooks/use-delete-handler";
import type { UseReportHandlerReturn } from "@/src/hooks/use-report-handler";
import { navigateToEditPost } from "@/src/utils/edit-post";

type RouterApi = {
  push: (route: string) => void;
};

type UseProfilePostActionsParams = {
  router: RouterApi;
  selectedPost: Post | null;
  setSelectedPost: Dispatch<SetStateAction<Post | null>>;
  postOptionsSheetRef: RefObject<PostOptionsSheetRef | null>;
  reportSheetRef: RefObject<ReportSheetRef | null>;
  deleteHandler: UseDeleteHandlerReturn;
  blockHandler: UseBlockHandlerReturn;
  reportHandler: UseReportHandlerReturn;
  globalHidePost: (postId: string) => void;
  globalHideComment: (commentId: string) => void;
  blockTopicOptimistic: (topic: string) => void;
  postsById: Map<string, Post>;
};

export function useProfilePostActions({
  router,
  selectedPost,
  setSelectedPost,
  postOptionsSheetRef,
  reportSheetRef,
  deleteHandler,
  blockHandler,
  reportHandler,
  globalHidePost,
  globalHideComment,
  blockTopicOptimistic,
  postsById,
}: UseProfilePostActionsParams) {
  const handlePostMorePress = useCallback(
    (postId: string) => {
      const post = postsById.get(postId);
      if (!post) return;
      setSelectedPost(post);
      setTimeout(() => postOptionsSheetRef.current?.present(), 50);
    },
    [postOptionsSheetRef, postsById, setSelectedPost],
  );

  const handleEditPost = useCallback(() => {
    if (!selectedPost) return;
    navigateToEditPost(selectedPost as any, router as any);
    setSelectedPost(null);
  }, [router, selectedPost, setSelectedPost]);

  const handleDeletePost = useCallback(() => {
    if (!selectedPost) return;
    deleteHandler.requestDelete(selectedPost.id, "post");
    postOptionsSheetRef.current?.dismiss();
  }, [deleteHandler, postOptionsSheetRef, selectedPost]);

  const handleBlockPost = useCallback(() => {
    if (!selectedPost) return;
    blockHandler.requestBlockPost(selectedPost.id);
    postOptionsSheetRef.current?.dismiss();
  }, [blockHandler, postOptionsSheetRef, selectedPost]);

  const handleReportPost = useCallback(() => {
    if (!selectedPost) return;
    reportHandler.requestReport(selectedPost.id, "post");
    postOptionsSheetRef.current?.dismiss();
  }, [postOptionsSheetRef, reportHandler, selectedPost]);

  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending) {
      if (pending.type === "post") {
        globalHidePost(pending.id);
      } else {
        globalHideComment(pending.id);
      }
    }
    setSelectedPost(null);
    deleteHandler.confirmDelete();
  }, [deleteHandler, globalHideComment, globalHidePost, setSelectedPost]);

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending?.type === "topic") {
      blockTopicOptimistic(pending.id);
    } else if (pending?.type === "post") {
      globalHidePost(pending.id);
    }
    setSelectedPost(null);
    blockHandler.confirmBlock();
  }, [blockHandler, blockTopicOptimistic, globalHidePost, setSelectedPost]);

  const handleReportSubmit = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending?.type === "post") {
        globalHidePost(pending.id);
      }
      setSelectedPost(null);
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [globalHidePost, reportHandler, reportSheetRef, setSelectedPost],
  );

  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet, reportSheetRef]);

  return {
    handlePostMorePress,
    handleEditPost,
    handleDeletePost,
    handleBlockPost,
    handleReportPost,
    handleConfirmDelete,
    handleConfirmBlock,
    handleReportSubmit,
  };
}
