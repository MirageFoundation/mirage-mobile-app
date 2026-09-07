import {
  AwardPickerSheet,
  ConfirmationPopup,
  GiftMirageSheet,
  GiftSubscriptionSheet,
  PostOptionsSheet,
  ReportSheet,
} from "@/src/components/molecules";
import { getBlockConfirmationMessage } from "@/src/hooks";

import type { PostActionController } from "./use-post-action-controller";

type PostActionOverlaysProps = {
  controller: PostActionController;
};

export function PostActionOverlays({ controller }: PostActionOverlaysProps) {
  const { selection, selectedActions, overlays } = controller;
  const post = selection.selectedPost;

  return (
    <>
      <PostOptionsSheet
        ref={overlays.postOptionsSheetRef}
        post={post}
        isOwnPost={selection.isOwnPost}
        isCommunityJoined={selection.isCommunityJoined}
        isFollowingUser={selection.isFollowingUser}
        onShowFewer={selectedActions.showFewer}
        onFollowUser={selectedActions.followUser}
        onToggleCommunityMembership={selectedActions.toggleCommunityMembership}
        onSave={selectedActions.save}
        isSaved={selection.isSaved}
        onCopyText={selectedActions.copyText}
        onReport={selectedActions.report}
        onBlockUser={selectedActions.blockUser}
        onHidePost={selectedActions.hidePost}
        onEdit={selectedActions.edit}
        onDelete={selectedActions.deletePost}
        onGiveAward={selectedActions.giveAward}
        onGiftMirage={selectedActions.giftMirage}
        onGiftSubscription={selectedActions.giftSubscription}
        onDismiss={selection.clear}
      />
      <AwardPickerSheet
        ref={overlays.awardPickerSheetRef}
        targetId={post?.id ?? ""}
        targetType="post"
        isOwnContent={selection.isOwnPost}
      />
      <GiftMirageSheet
        ref={overlays.giftMirageSheetRef}
        recipientAddress={post?.author.id ?? ""}
        recipientUsername={post?.author.username ?? ""}
      />
      <GiftSubscriptionSheet
        ref={overlays.giftSubscriptionSheetRef}
        recipientAddress={post?.author.id ?? ""}
        recipientUsername={post?.author.username ?? ""}
      />
      <ReportSheet
        ref={overlays.reportSheetRef}
        targetType="post"
        onSubmit={overlays.report.submit}
        onDismiss={overlays.report.cancel}
        isLoading={overlays.report.isLoading}
      />
      <ConfirmationPopup
        visible={overlays.block.visible}
        title={`Block ${overlays.block.pending?.label || "user"}?`}
        message={getBlockConfirmationMessage(overlays.block.pending?.type ?? "post")}
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={overlays.block.confirm}
        onCancel={overlays.block.cancel}
      />
      <ConfirmationPopup
        visible={overlays.deletion.visible}
        title="Delete this post?"
        message="This action cannot be undone."
        description="Your post will be permanently removed."
        icon="trash-outline"
        confirmText="Delete"
        isDestructive
        onConfirm={overlays.deletion.confirm}
        onCancel={overlays.deletion.cancel}
      />
    </>
  );
}
