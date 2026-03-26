import type { RefObject } from "react";

import {
  AwardPickerSheet,
  type AwardPickerSheetRef,
  CommentOptionsSheet,
  type Comment,
  type CommentOptionsSheetRef,
  ConfirmationPopup,
  PostOptionsSheet,
  type Post,
  type PostOptionsSheetRef,
  ReportSheet,
  type ReportSheetRef,
} from "@/src/components/molecules";

type PostDetailOverlaysProps = {
  optionsSheetRef: RefObject<CommentOptionsSheetRef | null>;
  postOptionsSheetRef: RefObject<PostOptionsSheetRef | null>;
  awardPickerSheetRef: RefObject<AwardPickerSheetRef | null>;
  reportSheetRef: RefObject<ReportSheetRef | null>;
  rootPostId?: string;
  selectedComment: Comment | null;
  displayPost: Post | null;
  isOwnComment: boolean;
  isFollowingCommentAuthor: boolean;
  isCommentSaved: boolean;
  onSaveComment: () => void;
  onDeleteComment: () => void;
  onEditComment: () => void;
  onBlockComment: () => void;
  onBlockCommentAuthor: () => void;
  onReportComment: () => void;
  onToggleFollowCommentAuthor: () => void;
  onGiveCommentAward: () => void;
  onDismissCommentOptions: () => void;
  isOwnPost: boolean;
  isTopicFollowed: boolean;
  isFollowingPostAuthor: boolean;
  isPostSaved: boolean;
  onFollowPost: () => void;
  onFollowTopic: () => void;
  onSavePost: () => void;
  onDeletePost: () => void;
  onEditPost: () => void;
  onBlockPost: () => void;
  onBlockPostAuthor: () => void;
  onReportPost: () => void;
  onGivePostAward: () => void;
  onAnnotatePost: () => void;
  awardTargetId: string;
  awardTargetType: "post" | "comment";
  awardTargetIsOwn: boolean;
  deleteVisible: boolean;
  deleteTargetType?: "post" | "comment" | "user" | "topic";
  isDeleting: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  blockVisible: boolean;
  blockLabel?: string;
  onConfirmBlock: () => void;
  onCancelBlock: () => void;
  reportTargetType?: "post" | "comment" | "user" | "topic";
  onSubmitReport: (reason: string) => void;
  onDismissReport: () => void;
  isReporting: boolean;
};

export function PostDetailOverlays({
  optionsSheetRef,
  postOptionsSheetRef,
  awardPickerSheetRef,
  reportSheetRef,
  rootPostId,
  selectedComment,
  displayPost,
  isOwnComment,
  isFollowingCommentAuthor,
  isCommentSaved,
  onSaveComment,
  onDeleteComment,
  onEditComment,
  onBlockComment,
  onBlockCommentAuthor,
  onReportComment,
  onToggleFollowCommentAuthor,
  onGiveCommentAward,
  onDismissCommentOptions,
  isOwnPost,
  isTopicFollowed,
  isFollowingPostAuthor,
  isPostSaved,
  onFollowPost,
  onFollowTopic,
  onSavePost,
  onDeletePost,
  onEditPost,
  onBlockPost,
  onBlockPostAuthor,
  onReportPost,
  onGivePostAward,
  onAnnotatePost,
  awardTargetId,
  awardTargetType,
  awardTargetIsOwn,
  deleteVisible,
  deleteTargetType,
  isDeleting,
  onConfirmDelete,
  onCancelDelete,
  blockVisible,
  blockLabel,
  onConfirmBlock,
  onCancelBlock,
  reportTargetType,
  onSubmitReport,
  onDismissReport,
  isReporting,
}: PostDetailOverlaysProps) {
  return (
    <>
      <CommentOptionsSheet
        ref={optionsSheetRef}
        comment={selectedComment}
        rootPostId={rootPostId}
        isOwnComment={isOwnComment}
        isFollowingAuthor={isFollowingCommentAuthor}
        isSaved={isCommentSaved}
        onSave={onSaveComment}
        onDelete={onDeleteComment}
        onEdit={onEditComment}
        onBlockComment={onBlockComment}
        onBlockUser={onBlockCommentAuthor}
        onReport={onReportComment}
        onToggleFollowAuthor={onToggleFollowCommentAuthor}
        onGiveAward={onGiveCommentAward}
        onDismiss={onDismissCommentOptions}
      />

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={displayPost}
        isOwnPost={isOwnPost}
        isTopicFollowed={isTopicFollowed}
        isFollowingUser={isFollowingPostAuthor}
        isSaved={isPostSaved}
        onFollowUser={onFollowPost}
        onFollowTopic={onFollowTopic}
        onSave={onSavePost}
        onDelete={onDeletePost}
        onEdit={onEditPost}
        onBlockPost={onBlockPost}
        onBlockUser={onBlockPostAuthor}
        onReport={onReportPost}
        onGiveAward={onGivePostAward}
        onAnnotate={onAnnotatePost}
        onDismiss={() => {}}
      />

      <AwardPickerSheet
        ref={awardPickerSheetRef}
        targetId={awardTargetId}
        targetType={awardTargetType}
        isOwnContent={awardTargetIsOwn}
      />

      <ConfirmationPopup
        visible={deleteVisible}
        title={deleteTargetType === "post" ? "Delete Post?" : "Delete Comment?"}
        message="This action cannot be undone."
        description="The content will be permanently removed."
        icon="trash-outline"
        isDestructive
        isLoading={isDeleting}
        confirmText="Delete"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <ConfirmationPopup
        visible={blockVisible}
        title={`Block ${blockLabel || "user"}?`}
        message="You won't see their content anymore."
        description="You can unblock them later from settings."
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
