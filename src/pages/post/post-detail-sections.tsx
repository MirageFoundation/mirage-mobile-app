import type { CommentsResponse } from "@/src/api/types";
import type { Post } from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import type { useAuthGuard } from "@/src/hooks";
import type { useAuthStore } from "@/src/stores/auth-store";
import type { ViewStyle } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import type { AnimatedStyle } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { PostDetailActionSheets } from "./post-detail-action-sheets";
import { PostDetailCommentComposer } from "./post-detail-comment-composer";
import { PostDetailCommentsSection } from "./post-detail-comments-section";
import { formatPostDetailCount } from "./post-detail-controller";
import type { PostDetailController } from "./use-post-detail-controller";
import { PostDetailHeader } from "./post-detail-header";
import { PostDetailNotFound } from "./post-detail-not-found";
import { PostDetailPostSection } from "./post-detail-post-section";
import { PostDetailStickySummary } from "./post-detail-sticky-summary";
import { styles } from "./post-detail-styles";
import type { usePostDetailFocusedThread } from "./use-post-detail-focused-thread";

type CurrentUser = ReturnType<typeof useAuthStore.getState>["user"];
type FocusedThread = ReturnType<typeof usePostDetailFocusedThread>;
type AuthGuard = ReturnType<typeof useAuthGuard>;

type PostDetailSectionsProps = {
  controller: PostDetailController;
  id: string;
  highlight?: string;
  reveal?: string;
  contentBottomInset: number;
  insetsTop: number;
  currentUser: CurrentUser;
  displayPost: Post | null;
  post: Post | null;
  isViewingComment: boolean;
  effectiveCommentsData?: CommentsResponse;
  focusedThread: FocusedThread;
  followedTopics: string[];
  followedUsers: string[];
  isCommentsError: boolean;
  isFetchingComments: boolean;
  isLoadingComments: boolean;
  isRefetchingComments: boolean;
  shouldUseOptimisticRootFallback: boolean;
  screenActive: boolean;
  shareServer: string;
  videoSyncScope?: string;
  postEnteringStyle: AnimatedStyle<ViewStyle>;
  isLoggedIn: boolean;
  showAuthSheet: () => void;
  requireAuth: AuthGuard["requireAuth"];
  refetchComments: () => unknown;
};

export function PostDetailSections({
  controller,
  id,
  highlight,
  reveal,
  contentBottomInset,
  insetsTop,
  currentUser,
  displayPost,
  post,
  isViewingComment,
  effectiveCommentsData,
  focusedThread,
  followedTopics,
  followedUsers,
  isCommentsError,
  isFetchingComments,
  isLoadingComments,
  isRefetchingComments,
  shouldUseOptimisticRootFallback,
  screenActive,
  shareServer,
  videoSyncScope,
  postEnteringStyle,
  isLoggedIn,
  showAuthSheet,
  requireAuth,
  refetchComments,
}: PostDetailSectionsProps) {
  const { theme } = useUnistyles();
  const header = (
    <PostDetailHeader
      topic={displayPost?.topic}
      isLoadingTopic={!displayPost && isLoadingComments}
      insetsTop={insetsTop}
      onBack={controller.availability.useUnavailableBack ? controller.navigation.unavailableBack : controller.navigation.back}
      onTopicPress={controller.navigation.topicPress}
      onOptionsPress={displayPost ? () => requireAuth(() => controller.refs.actionSheetsRef.current?.presentPostOptions()) : undefined}
    />
  );

  if (controller.availability.isUnavailable) {
    return (
      <PostDetailNotFound
        description={controller.availability.description}
        header={header}
        message={controller.availability.message}
        onBack={controller.navigation.unavailableBack}
      />
    );
  }

  const listHeader = (
    <PostDetailPostSection
      actionSheetsRef={controller.refs.actionSheetsRef}
      contentInitiallyRevealed={reveal === "true"}
      currentUserId={currentUser?.id}
      focusedCommentId={focusedThread.focusedCommentId}
      focusedCommentNotFound={focusedThread.isFocusedCommentNotFound}
      followedTopics={followedTopics}
      hasFocusedRecentContext={controller.thread.hasRecentContext}
      hasFullThreadBeyondFocus={controller.thread.hasFullThreadBeyondFocus}
      id={id}
      isVideoVisible={controller.scroll.isVideoVisible}
      loadFocusedContext={controller.thread.loadFocusedContext}
      onLayout={controller.scroll.handlePostHeaderLayout}
      onShowFullThread={controller.thread.showFullThread}
      post={displayPost}
      postEnteringStyle={postEnteringStyle}
      recentContextDone={controller.thread.recentContextDone}
      screenActive={screenActive}
      shareServer={shareServer}
      videoSyncScope={videoSyncScope}
    />
  );

  return (
    <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
      <Box flex background="base">
        {header}
        <PostDetailStickySummary
          animatedStyle={controller.scroll.stickyHeaderAnimatedStyle}
          formatCount={formatPostDetailCount}
          insetsTop={insetsTop}
          isInteractive={controller.scroll.isStickyInteractive}
          post={displayPost}
          theme={theme}
        />
        <PostDetailCommentsSection
          ref={controller.refs.commentsSectionRef}
          comments={controller.thread.allComments}
          commentsCount={effectiveCommentsData?.children?.length ?? 0}
          contentBottomPadding={contentBottomInset + 60}
          currentUserId={currentUser?.id}
          followedUsers={followedUsers}
          followLoadingUsers={controller.thread.followLoadingUsers}
          highlightedCommentId={controller.scroll.highlightedCommentId}
          isCommentsError={isCommentsError && !shouldUseOptimisticRootFallback}
          isFetchingComments={isFetchingComments}
          isLoadingComments={isLoadingComments}
          isLoadingContext={focusedThread.isLoadingContext}
          isLoadingFocusedComment={focusedThread.isLoadingFocusedComment}
          isLoadingFullThreadComments={focusedThread.isLoadingFullThreadComments}
          isRefetchingComments={isRefetchingComments}
          listHeader={listHeader}
          onAuthorPress={controller.navigation.authorPress}
          onContentSizeChange={controller.scroll.handleContentSizeChange}
          onDislikeComment={controller.thread.handleDislikeComment}
          onFollowCommentAuthor={controller.thread.followCommentAuthor}
          onHighlightedLayout={controller.scroll.handleHighlightedCommentLayout}
          onLikeComment={controller.thread.handleLikeComment}
          onMoreOptions={controller.thread.moreOptions}
          onRefreshComments={refetchComments}
          onReplyToComment={controller.thread.replyToComment}
          onScroll={controller.scroll.handleScroll}
        />
        <PostDetailCommentComposer
          ref={controller.refs.commentComposerRef}
          addReplyOptimisticComment={controller.composer.addReplyOptimisticComment}
          addTopLevelOptimisticComment={controller.composer.addTopLevelOptimisticComment}
          baseCommentCount={displayPost?.comments ?? 0}
          currentUser={currentUser}
          decrementCommentCount={controller.composer.decrementCommentCount}
          focusedCommentId={focusedThread.focusedCommentId}
          id={id}
          implicitReplyRoot={effectiveCommentsData?.root}
          incrementCommentCount={controller.composer.incrementCommentCount}
          isLoggedIn={isLoggedIn}
          isViewingComment={isViewingComment}
          onAuthRequired={showAuthSheet}
          onClearFocusedThread={controller.composer.clearFocusedThread}
          onCommentCountDelta={controller.composer.handleCommentCountDelta}
          onConfirmedCommentId={controller.composer.handleConfirmedCommentId}
          onHighlightComment={controller.scroll.handleComposerHighlight}
          onRefetchAfterSuccess={controller.composer.refetchAfterSuccess}
          onScrollToEndAfterLayout={controller.scroll.handleComposerScrollToEnd}
          optimisticThreadId={focusedThread.optimisticThreadId}
          post={displayPost}
          removeOptimisticComment={controller.composer.removeOptimisticComment}
          replaceOptimisticCommentId={controller.composer.replaceOptimisticCommentId}
          requireAuth={requireAuth}
          rootPostCommentCount={post?.comments ?? 0}
          showFocusedThread={focusedThread.showFocusedThread}
        />
        <PostDetailActionSheets
          ref={controller.refs.actionSheetsRef}
          actualRootPostId={focusedThread.actualRootPostId}
          currentUserId={currentUser?.id}
          followedTopics={followedTopics}
          followedUsers={followedUsers}
          highlight={highlight}
          id={id}
          post={displayPost}
          rootPost={effectiveCommentsData?.root}
        />
      </Box>
    </KeyboardAvoidingView>
  );
}
