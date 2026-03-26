import {
  AwardPickerSheet,
  type AwardPickerSheetRef,
  ConfirmationPopup,
  type Post,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  ReportSheet,
  type ReportSheetRef,
} from "@/src/components/molecules";
import { useSavedPostsStore } from "@/src/stores";

interface TopicFeedOverlaysProps {
  awardPickerSheetRef: React.RefObject<AwardPickerSheetRef | null>;
  blockCancel: () => void;
  blockConfirm: () => void;
  blockLabel?: string;
  blockVisible: boolean;
  currentUserId?: string;
  deleteCancel: () => void;
  deleteConfirm: () => void;
  deleteVisible: boolean;
  followedTopics: string[];
  followedUsers: string[];
  isReporting: boolean;
  onBlockPost: () => void;
  onBlockUser: () => void;
  onCopyText: () => void;
  onDelete: () => void;
  onDismissPostOptions: () => void;
  onEdit: () => void;
  onFollowTopic: () => void;
  onFollowUser: () => void;
  onGiveAward: () => void;
  onHidePost: () => void;
  onReport: () => void;
  onReportDismiss: () => void;
  onReportSubmit: (reason: string) => void;
  onSave: () => void;
  onShowFewer: () => void;
  postOptionsSheetRef: React.RefObject<PostOptionsSheetRef | null>;
  reportSheetRef: React.RefObject<ReportSheetRef | null>;
  selectedPost: Post | null;
}

export function TopicFeedOverlays({
  awardPickerSheetRef,
  blockCancel,
  blockConfirm,
  blockLabel,
  blockVisible,
  currentUserId,
  deleteCancel,
  deleteConfirm,
  deleteVisible,
  followedTopics,
  followedUsers,
  isReporting,
  onBlockPost,
  onBlockUser,
  onCopyText,
  onDelete,
  onDismissPostOptions,
  onEdit,
  onFollowTopic,
  onFollowUser,
  onGiveAward,
  onHidePost,
  onReport,
  onReportDismiss,
  onReportSubmit,
  onSave,
  onShowFewer,
  postOptionsSheetRef,
  reportSheetRef,
  selectedPost,
}: TopicFeedOverlaysProps) {
  return (
    <>
      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={currentUserId === selectedPost?.author.id}
        isTopicFollowed={
          selectedPost?.topic ? followedTopics.includes(selectedPost.topic) : false
        }
        isFollowingUser={
          selectedPost?.author.id
            ? followedUsers.includes(selectedPost.author.id)
            : false
        }
        onShowFewer={onShowFewer}
        onFollowUser={onFollowUser}
        onFollowTopic={onFollowTopic}
        onSave={onSave}
        isSaved={
          selectedPost
            ? useSavedPostsStore.getState().savedPosts.some((p) => p.id === selectedPost.id)
            : false
        }
        onCopyText={onCopyText}
        onReport={onReport}
        onBlockUser={onBlockUser}
        onHidePost={onHidePost}
        onEdit={onEdit}
        onDelete={onDelete}
        onGiveAward={onGiveAward}
        onDismiss={onDismissPostOptions}
      />

      <AwardPickerSheet
        ref={awardPickerSheetRef}
        targetId={selectedPost?.id ?? ""}
        targetType="post"
        isOwnContent={currentUserId === selectedPost?.author.id}
      />

      <ReportSheet
        ref={reportSheetRef}
        targetType="post"
        onSubmit={onReportSubmit}
        onDismiss={onReportDismiss}
        isLoading={isReporting}
      />

      <ConfirmationPopup
        visible={blockVisible}
        title={`Block ${blockLabel || "user"}?`}
        message="You won't see their content anymore."
        description="You can unblock them later from settings."
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={blockConfirm}
        onCancel={blockCancel}
      />

      <ConfirmationPopup
        visible={deleteVisible}
        title="Delete this post?"
        message="This action cannot be undone."
        description="Your post will be permanently removed."
        icon="trash-outline"
        confirmText="Delete"
        isDestructive
        onConfirm={deleteConfirm}
        onCancel={deleteCancel}
      />
    </>
  );
}
