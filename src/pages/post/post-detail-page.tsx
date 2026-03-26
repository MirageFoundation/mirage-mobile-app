import { getGradientColor } from "@/src/components/molecules/profile-header";
import { CommentInput } from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { PostDetailCommentsList } from "./components/post-detail-comments-list";
import { PostDetailOverlays } from "./components/post-detail-overlays";
import { PostDetailScreenHeader } from "./components/post-detail-screen-header";
import { PostDetailStickyHeader } from "./components/post-detail-sticky-header";
import { usePostDetailScrollState } from "./use-post-detail-scroll-state";
import { usePostDetailScreen } from "./use-post-detail-screen";

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const gradientColors = useMemo(
    () => getGradientColor().filter((color) => color !== "#000000"),
    [],
  );
  const headerGradientColors = useMemo(
    () => [...gradientColors] as [string, string, ...string[]],
    [gradientColors],
  );

  const {
    allComments,
    awardPickerSheetRef,
    awardTargetId,
    awardTargetIsOwn,
    awardTargetType,
    blockHandler,
    commentInputRef,
    currentUser,
    deleteHandler,
    displayPost,
    flatListRef,
    followLoadingUsers,
    followedUsers,
    handleAnnotatePost,
    handleAuthorPress,
    handleBack,
    handleBlockComment,
    handleBlockCommentAuthor,
    handleBlockPost,
    handleBlockPostAuthor,
    handleCancelReply,
    handleConfirmBlock,
    handleConfirmDelete,
    handleDeleteComment,
    handleDeletePost,
    handleDislikeComment,
    handleDislikePost,
    handleEditComment,
    handleEditPost,
    handleFollowCommentAuthor,
    handleFollowPost,
    handleFollowTopic,
    handleGiveCommentAward,
    handleGivePostAward,
    handleLikeComment,
    handleLikePost,
    handleMoreOptions,
    handlePostMorePress,
    handleRefreshComments,
    handleReplyToComment,
    handleReportComment,
    handleReportPost,
    handleReportSubmitWithOptimistic,
    handleRevealContent,
    handleSaveComment,
    handleSavePost,
    handleScrollToIndexFailed,
    handleTopicPress,
    handleToggleFollowCommentAuthor,
    highlightedCommentId,
    id,
    isCommentSaved,
    isCommentsError,
    isFollowingCommentAuthor,
    isFollowingPostAuthor,
    isLoadingComments,
    isLoggedIn,
    isOwnComment,
    isOwnPost,
    isPostSaved,
    isRefetchingComments,
    isTopicFollowed,
    optionsSheetRef,
    postOptionsSheetRef,
    postThumbnail,
    reportHandler,
    reportSheetRef,
    replyingTo,
    revealedContent,
    screenActive,
    selectedComment,
    setSelectedComment,
    shareUrl,
    showAuthSheet,
    videoSyncScope,
  } = usePostDetailScreen();

  const {
    handlePostHeaderLayout,
    handleScroll,
    isStickyInteractive,
    isVideoVisible,
    postEnteringStyle,
    stickyHeaderAnimatedStyle,
  } = usePostDetailScrollState(insets.top);

  return (
    <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
      <Box flex background="base">
        <PostDetailScreenHeader
          topInset={insets.top}
          gradientColors={headerGradientColors}
          onBack={handleBack}
        />

        <PostDetailStickyHeader
          backgroundColor={theme.colors.background.default}
          top={insets.top + 40}
          animatedStyle={stickyHeaderAnimatedStyle}
          isInteractive={isStickyInteractive}
          title={displayPost?.title}
          likes={displayPost?.likes ?? 0}
          comments={displayPost?.comments ?? 0}
          thumbnailUri={postThumbnail}
        />

        <PostDetailCommentsList
          allComments={allComments}
          currentUserId={currentUser?.id}
          displayPost={displayPost}
          dividerColor={theme.colors.border.default}
          errorColor={theme.colors.error[500]}
          followedUsers={followedUsers}
          followLoadingUsers={followLoadingUsers}
          headerAnimatedStyle={postEnteringStyle}
          highlightedCommentId={highlightedCommentId}
          insetsBottom={insets.bottom}
          isCommentsError={isCommentsError}
          isLoadingComments={isLoadingComments}
          isRefetchingComments={isRefetchingComments}
          isTopicFollowed={isTopicFollowed}
          isVideoVisible={isVideoVisible}
          listRef={flatListRef}
          loadingBackgroundColor={theme.colors.background.subtle}
          onAuthorPress={handleAuthorPress}
          onBlockPost={handleBlockPost}
          onBlockPostAuthor={handleBlockPostAuthor}
          onCommentDislikePress={handleDislikeComment}
          onCommentFollowPress={handleFollowCommentAuthor}
          onCommentLikePress={handleLikeComment}
          onCommentMorePress={handleMoreOptions}
          onCommentReplyPress={handleReplyToComment}
          onDislikePost={handleDislikePost}
          onEmptyRetry={handleRefreshComments}
          onFollowPost={handleFollowPost}
          onFollowTopic={handleFollowTopic}
          onLikePost={handleLikePost}
          onPostHeaderLayout={handlePostHeaderLayout}
          onPostMorePress={handlePostMorePress}
          onRefresh={handleRefreshComments}
          onReportPost={handleReportPost}
          onRevealContent={handleRevealContent}
          onScroll={handleScroll}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onTopicPress={handleTopicPress}
          primaryTintColor={theme.colors.primary[500]}
          revealedContent={revealedContent}
          screenActive={screenActive}
          shareUrl={shareUrl}
          subtleBackgroundColor={theme.colors.background.subtle}
          subtleTextColor={theme.colors.text.subtle}
          videoSyncScope={videoSyncScope}
        />

        <CommentInput
          ref={commentInputRef}
          isLoggedIn={isLoggedIn}
          onAuthRequired={showAuthSheet}
          replyingTo={replyingTo?.author.username}
          replyingToId={replyingTo?.id}
          replyingToContent={replyingTo?.content}
          onCancelReply={handleCancelReply}
          postId={id}
          postTitle={displayPost?.title}
          postAuthorUsername={displayPost?.author.username}
          postThumbnail={postThumbnail}
          postContent={displayPost?.body}
        />

        <PostDetailOverlays
          optionsSheetRef={optionsSheetRef}
          postOptionsSheetRef={postOptionsSheetRef}
          awardPickerSheetRef={awardPickerSheetRef}
          reportSheetRef={reportSheetRef}
          rootPostId={id}
          selectedComment={selectedComment}
          displayPost={displayPost}
          isOwnComment={isOwnComment}
          isFollowingCommentAuthor={isFollowingCommentAuthor}
          isCommentSaved={isCommentSaved}
          onSaveComment={handleSaveComment}
          onDeleteComment={handleDeleteComment}
          onEditComment={handleEditComment}
          onBlockComment={handleBlockComment}
          onBlockCommentAuthor={handleBlockCommentAuthor}
          onReportComment={handleReportComment}
          onToggleFollowCommentAuthor={handleToggleFollowCommentAuthor}
          onGiveCommentAward={handleGiveCommentAward}
          onDismissCommentOptions={() => setSelectedComment(null)}
          isOwnPost={isOwnPost}
          isTopicFollowed={isTopicFollowed}
          isFollowingPostAuthor={isFollowingPostAuthor}
          isPostSaved={isPostSaved}
          onFollowPost={handleFollowPost}
          onFollowTopic={handleFollowTopic}
          onSavePost={handleSavePost}
          onDeletePost={handleDeletePost}
          onEditPost={handleEditPost}
          onBlockPost={handleBlockPost}
          onBlockPostAuthor={handleBlockPostAuthor}
          onReportPost={handleReportPost}
          onGivePostAward={handleGivePostAward}
          onAnnotatePost={handleAnnotatePost}
          awardTargetId={awardTargetId}
          awardTargetType={awardTargetType}
          awardTargetIsOwn={awardTargetIsOwn}
          deleteVisible={deleteHandler.showConfirmation}
          deleteTargetType={deleteHandler.pendingTarget?.type}
          isDeleting={deleteHandler.isDeleting}
          onConfirmDelete={handleConfirmDelete}
          onCancelDelete={deleteHandler.cancelDelete}
          blockVisible={blockHandler.showConfirmation}
          blockLabel={blockHandler.pendingBlock?.label}
          onConfirmBlock={handleConfirmBlock}
          onCancelBlock={blockHandler.cancelBlock}
          reportTargetType={reportHandler.pendingTarget?.type}
          onSubmitReport={handleReportSubmitWithOptimistic}
          onDismissReport={reportHandler.cancelReport}
          isReporting={reportHandler.isReporting}
        />
      </Box>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create((theme) => ({
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background.default,
  },
}));
