import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { useRouter } from "@/src/navigation/guarded-router";
import {
  ConfirmationPopup,
  type Post,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  ReportSheet,
  type ReportSheetRef,
} from "@/src/components/molecules";
import {
  getBlockConfirmationMessage,
  useBlockHandler,
  useDeleteHandler,
  useReportHandler,
} from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import {
  useContentModerationStore,
  useSavedPostsStore,
} from "@/src/stores";
import { navigateToEditPost } from "@/src/utils/edit-post";

export type ProfilePostActionSheetsRef = {
  openPost: (post: Post) => void;
  requestBlockPost: (postId: string) => void;
  requestBlockUser: (userId: string, username?: string) => void;
  requestReportPost: (postId: string) => void;
};

type ProfilePostActionSheetsProps = {
  isOwnPost: boolean;
};

export const ProfilePostActionSheets = forwardRef<
  ProfilePostActionSheetsRef,
  ProfilePostActionSheetsProps
>(function ProfilePostActionSheets({ isOwnPost }, ref) {
  const router = useRouter();
  const toast = useToast();
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalUnhidePost = useContentModerationStore((s) => s.unhidePost);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);
  const globalUnhideComment = useContentModerationStore((s) => s.unhideComment);
  const blockTopicOptimistic = useContentModerationStore((s) => s.blockTopic);

  const deleteHandler = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") {
        globalUnhidePost(targetId);
      } else {
        globalUnhideComment(targetId);
      }
    },
  });
  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});

  useImperativeHandle(
    ref,
    () => ({
      openPost: (post: Post) => {
        setSelectedPost(post);
        postOptionsSheetRef.current?.present();
      },
      requestBlockPost: (postId: string) => {
        blockHandler.requestBlockPost(postId);
      },
      requestBlockUser: (userId: string, username?: string) => {
        blockHandler.requestBlockUser(userId, username);
      },
      requestReportPost: (postId: string) => {
        reportHandler.requestReport(postId, "post");
      },
    }),
    [blockHandler, reportHandler],
  );

  const handleSave = useCallback(() => {
    if (!selectedPost) return;
    const saved = useSavedPostsStore.getState().toggleSavePost(selectedPost);
    toast.success(
      saved ? "Post saved" : "Post unsaved",
      saved
        ? "You can find it in your saved items."
        : "Removed from saved items.",
    );
  }, [selectedPost, toast]);

  const handleEditPost = useCallback(() => {
    if (!selectedPost) return;
    navigateToEditPost(router, selectedPost);
  }, [selectedPost, router]);

  const handleDeletePost = useCallback(() => {
    if (!selectedPost) return;
    deleteHandler.requestDelete(selectedPost.id, "post");
  }, [selectedPost, deleteHandler]);

  const handleBlockPost = useCallback(() => {
    if (!selectedPost) return;
    blockHandler.requestBlockPost(selectedPost.id);
  }, [selectedPost, blockHandler]);

  const handleReportPost = useCallback(() => {
    if (!selectedPost) return;
    reportHandler.requestReport(selectedPost.id, "post");
  }, [selectedPost, reportHandler]);

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
  }, [deleteHandler, globalHidePost, globalHideComment]);

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending && pending.type === "topic") {
      blockTopicOptimistic(pending.id);
    } else if (pending && pending.type === "post") {
      globalHidePost(pending.id);
    }
    setSelectedPost(null);
    blockHandler.confirmBlock();
  }, [blockHandler, globalHidePost, blockTopicOptimistic]);

  const handleReportSubmit = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending && pending.type === "post") {
        globalHidePost(pending.id);
      }
      setSelectedPost(null);
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [reportHandler, globalHidePost],
  );

  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

  return (
    <>
      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={isOwnPost}
        isSaved={
          selectedPost ? savedPosts.some((post) => post.id === selectedPost.id) : false
        }
        onSave={handleSave}
        onEdit={handleEditPost}
        onDelete={handleDeletePost}
        onBlockPost={handleBlockPost}
        onReport={handleReportPost}
        onDismiss={() => setSelectedPost(null)}
      />

      <ConfirmationPopup
        visible={deleteHandler.showConfirmation}
        title={
          deleteHandler.pendingTarget?.type === "comment"
            ? "Delete Comment?"
            : "Delete Post?"
        }
        message="This action cannot be undone."
        description={
          deleteHandler.pendingTarget?.type === "comment"
            ? "The comment will be permanently removed."
            : "The post will be permanently removed."
        }
        icon="trash-outline"
        isDestructive
        isLoading={deleteHandler.isDeleting}
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={deleteHandler.cancelDelete}
      />

      <ConfirmationPopup
        visible={blockHandler.showConfirmation}
        title={`Block ${blockHandler.pendingBlock?.label || "this post"}?`}
        message={getBlockConfirmationMessage(
          blockHandler.pendingBlock?.type ?? "post",
        )}
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={handleConfirmBlock}
        onCancel={blockHandler.cancelBlock}
      />

      <ReportSheet
        ref={reportSheetRef}
        targetType={reportHandler.pendingTarget?.type}
        onSubmit={handleReportSubmit}
        onDismiss={reportHandler.cancelReport}
        isLoading={reportHandler.isReporting}
      />
    </>
  );
});
