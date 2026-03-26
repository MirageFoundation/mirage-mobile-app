import type { RefObject } from "react";

import {
  ConfirmationPopup,
  type Post,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  ReportSheet,
  type ReportSheetRef,
} from "@/src/components/molecules";

type ProfileOverlaysProps = {
  postOptionsSheetRef: RefObject<PostOptionsSheetRef | null>;
  reportSheetRef: RefObject<ReportSheetRef | null>;
  selectedPost: Post | null;
  isSaved: boolean;
  deleteVisible: boolean;
  deleteType?: "post" | "comment";
  isDeleting: boolean;
  blockVisible: boolean;
  blockLabel?: string;
  reportTargetType?: "post" | "comment";
  isReporting: boolean;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlockPost: () => void;
  onReport: () => void;
  onDismissPostOptions: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onConfirmBlock: () => void;
  onCancelBlock: () => void;
  onSubmitReport: (reason: string) => void;
  onDismissReport: () => void;
};

export function ProfileOverlays({
  postOptionsSheetRef,
  reportSheetRef,
  selectedPost,
  isSaved,
  deleteVisible,
  deleteType,
  isDeleting,
  blockVisible,
  blockLabel,
  reportTargetType,
  isReporting,
  onSave,
  onEdit,
  onDelete,
  onBlockPost,
  onReport,
  onDismissPostOptions,
  onConfirmDelete,
  onCancelDelete,
  onConfirmBlock,
  onCancelBlock,
  onSubmitReport,
  onDismissReport,
}: ProfileOverlaysProps) {
  return (
    <>
      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost
        isSaved={isSaved}
        onSave={onSave}
        onEdit={onEdit}
        onDelete={onDelete}
        onBlockPost={onBlockPost}
        onReport={onReport}
        onDismiss={onDismissPostOptions}
      />

      <ConfirmationPopup
        visible={deleteVisible}
        title={deleteType === "comment" ? "Delete Comment?" : "Delete Post?"}
        message="This action cannot be undone."
        description={
          deleteType === "comment"
            ? "The comment will be permanently removed."
            : "The post will be permanently removed."
        }
        icon="trash-outline"
        isDestructive
        isLoading={isDeleting}
        confirmText="Delete"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <ConfirmationPopup
        visible={blockVisible}
        title={`Block ${blockLabel || "this post"}?`}
        message="You won't see this content anymore."
        description="You can unblock later from settings."
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={onConfirmBlock}
        onCancel={onCancelBlock}
      />

      <ReportSheet
        ref={reportSheetRef}
        targetType={reportTargetType}
        onSubmit={onSubmitReport}
        onDismiss={onDismissReport}
        isLoading={isReporting}
      />
    </>
  );
}
