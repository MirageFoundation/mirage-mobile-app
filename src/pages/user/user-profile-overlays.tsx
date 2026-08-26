import {
  ConfirmationPopup,
  GiftMirageSheet,
  GiftSubscriptionSheet,
  ReportSheet,
} from "@/src/components/molecules";
import { getBlockConfirmationMessage } from "@/src/hooks";
import { ProfilePostActionSheets } from "@/src/pages/profile/profile-post-action-sheets";
import { UserProfileMenuSheet } from "./user-profile-menu-sheet";
import type { UserProfileController } from "./use-user-profile-controller";

type Props = {
  controller: UserProfileController;
};

export function UserProfileOverlays({ controller }: Props) {
  const {
    displayUsername,
    giftMirageSheetRef,
    giftSubscriptionSheetRef,
    handleCancelBlockUser,
    handleConfirmBlockUser,
    handleCopyProfileLink,
    handleFollow,
    handleGiftMirageToUser,
    handleGiftSubscriptionToUser,
    handleReportUser,
    handleReportUserSubmit,
    handleRequestBlockUser,
    handleShareProfile,
    handleUnblockUser,
    handleUnfollow,
    isBlocked,
    isBlockingUser,
    isFollowing,
    isOwnProfile,
    postActionSheetsRef,
    reportSheetRef,
    showBlockUserConfirmation,
    userAddress,
    userMenuSheetRef,
  } = controller;
  const recipientUsername = displayUsername ?? "user";

  return (
    <>
      {!isOwnProfile && (
        <UserProfileMenuSheet
          ref={userMenuSheetRef}
          username={displayUsername ?? undefined}
          isFollowing={isFollowing}
          isBlocked={isBlocked}
          isOwnProfile={isOwnProfile}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          onBlock={handleRequestBlockUser}
          onUnblock={handleUnblockUser}
          onReport={handleReportUser}
          onCopyProfileLink={handleCopyProfileLink}
          onShare={handleShareProfile}
          onGiftMirage={handleGiftMirageToUser}
          onGiftSubscription={handleGiftSubscriptionToUser}
        />
      )}

      {!isOwnProfile && userAddress && (
        <>
          <GiftMirageSheet
            ref={giftMirageSheetRef}
            recipientAddress={userAddress}
            recipientUsername={recipientUsername}
          />
          <GiftSubscriptionSheet
            ref={giftSubscriptionSheetRef}
            recipientAddress={userAddress}
            recipientUsername={recipientUsername}
          />
        </>
      )}

      <ProfilePostActionSheets
        ref={postActionSheetsRef}
        isOwnPost={isOwnProfile}
      />
      <ConfirmationPopup
        visible={showBlockUserConfirmation}
        title={`Block @${recipientUsername}?`}
        message={getBlockConfirmationMessage("user")}
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        isLoading={isBlockingUser}
        onConfirm={handleConfirmBlockUser}
        onCancel={handleCancelBlockUser}
      />
      <ReportSheet
        ref={reportSheetRef}
        targetType="post"
        onSubmit={handleReportUserSubmit}
        onDismiss={() => undefined}
        isLoading={false}
      />
    </>
  );
}
