import { useEffect, useState } from "react";
import { useIsFocused } from "expo-router/react-navigation";
import { usePostDetailActionStateStore } from "@/src/stores/post-detail-action-state-store";
import type { CommentsResponse } from "@/src/api/types";
import type { Post } from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { ModerationProvider } from "@/src/features/moderation/moderation-provider";
import { getThreadReplyPolicy } from "@/src/domain/content";
import type { useAuthGuard } from "@/src/hooks";
import type { useAuthStore } from "@/src/stores/auth-store";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { SwipeBackGestureContext } from "@/src/components/ui/swipe-back-guard";
import { usePostDetailDismiss } from "./use-post-detail-dismiss";

import { PostDetailActionSheets } from "./post-detail-action-sheets";
import { PostDetailCommentComposer } from "./post-detail-comment-composer";
import { PostDetailCommentsSection } from "./post-detail-comments-section";
import { PostCommentsHeading } from "./post-comments-heading";
import type { PostDetailController } from "./use-post-detail-controller";
import { PostDetailHeader } from "./post-detail-header";
import { PostDetailNotFound } from "./post-detail-not-found";
import { PostDetailPostSection } from "./post-detail-post-section";
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
  joinedCommunities: string[];
  followedUsers: string[];
  isCommentsError: boolean;
  isFetchingComments: boolean;
  isLoadingComments: boolean;
  shouldUseOptimisticRootFallback: boolean;
  screenActive: boolean;
  shareServer: string;
  videoSyncScope?: string;
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
  joinedCommunities,
  followedUsers,
  isCommentsError,
  isFetchingComments,
  isLoadingComments,
  shouldUseOptimisticRootFallback,
  screenActive,
  shareServer,
  videoSyncScope,
  isLoggedIn,
  showAuthSheet,
  requireAuth,
  refetchComments,
}: PostDetailSectionsProps) {
  const isFocused = useIsFocused();
  const onBack = controller.availability.useUnavailableBack ? controller.navigation.unavailableBack : controller.navigation.back;
  const dismissGestures = usePostDetailDismiss(controller.scroll.scrollY, isFocused && screenActive, onBack);
  const [postHeaderHeight, setPostHeaderHeight] = useState(0);
  const commentsRequestedFor = usePostDetailActionStateStore((state) => state.commentsRequestedFor);
  const commentsRef = controller.refs.commentsSectionRef;
  useEffect(() => {
    if (!isFocused || commentsRequestedFor !== displayPost?.id || !displayPost || postHeaderHeight <= 0) return;
    controller.scroll.suppressHighlightAutoScroll();
    commentsRef.current?.scrollToOffset({ offset: postHeaderHeight, animated: true });
    usePostDetailActionStateStore.getState().requestComments(null);
  }, [commentsRef, commentsRequestedFor, controller.scroll, displayPost, isFocused, postHeaderHeight]);
  const header = (
    <PostDetailHeader
      topic={displayPost?.community}
      isLoadingTopic={!displayPost && isLoadingComments}
      insetsTop={insetsTop}
      onBack={onBack}
      onCommunityPress={controller.navigation.communityPress}
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
    <>
    <PostDetailPostSection
      actionSheetsRef={controller.refs.actionSheetsRef}
      contentInitiallyRevealed={reveal === "true"}
      currentUserId={currentUser?.id}
      focusedCommentId={focusedThread.focusedCommentId}
      focusedCommentNotFound={focusedThread.isFocusedCommentNotFound}
      joinedCommunities={joinedCommunities}
      hasFocusedRecentContext={controller.thread.hasRecentContext}
      hasFullThreadBeyondFocus={controller.thread.hasFullThreadBeyondFocus}
      id={id}
      isVideoVisible={controller.scroll.isVideoVisible}
      loadFocusedContext={controller.thread.loadFocusedContext}
      onMediaLayout={controller.scroll.handleMediaLayout}
      onLayout={(event) => {
        setPostHeaderHeight(event.nativeEvent.layout.height);
      }}
      onShowFullThread={controller.thread.showFullThread}
      post={displayPost}
      recentContextDone={controller.thread.recentContextDone}
      screenActive={screenActive}
      shareServer={shareServer}
      videoSyncScope={videoSyncScope}
    />
    <PostCommentsHeading sort={controller.thread.commentSort} onSort={controller.thread.setCommentSort} />
    </>
  );

  return (
    <ModerationProvider root={{ postId: id, authorId: displayPost?.author.id ?? "", community: displayPost?.rootCommunity || displayPost?.community, lens: displayPost?.lens, rootHash: focusedThread.actualRootPostId }}>
    <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
      <Box flex background="base">
        <SwipeBackGestureContext.Provider value={dismissGestures}>
        <GestureDetector gesture={dismissGestures.pan}>
        <View style={{ flex: 1 }} collapsable={false}>
        {header}
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
          scrollY={controller.scroll.scrollY}
          listHeader={listHeader}
          onAuthorPress={controller.navigation.authorPress}
          onContentSizeChange={controller.scroll.handleContentSizeChange}
          onDislikeComment={controller.thread.handleDislikeComment}
          onFollowCommentAuthor={controller.thread.followCommentAuthor}
          onHighlightedLayout={controller.scroll.handleHighlightedCommentLayout}
          onLikeComment={controller.thread.handleLikeComment}
          onMoreOptions={controller.thread.moreOptions}
          onRetryComments={refetchComments}
          onReplyToComment={controller.thread.replyToComment}
          repliesEnabled={getThreadReplyPolicy(
            focusedThread.actualRootPost ?? effectiveCommentsData?.root ?? {
              protocol_version: displayPost?.protocolVersion,
              thread_locked: displayPost?.threadLocked,
            },
          ).canReply}
          onScroll={controller.scroll.handleScroll}
          onScrollBeginDrag={controller.scroll.handleUserScrollBeginDrag}
        />
        </View>
        </GestureDetector>
        </SwipeBackGestureContext.Provider>
        {(() => {
          const replyPolicy = getThreadReplyPolicy(
            focusedThread.actualRootPost ?? effectiveCommentsData?.root ?? {
              protocol_version: displayPost?.protocolVersion,
              thread_locked: displayPost?.threadLocked,
            },
          );
          if (!replyPolicy.canReply) {
            return (
              <Box p="md" style={{ alignItems: "center" }}>
                <Text size="sm" mode="subtle">{replyPolicy.notice}</Text>
              </Box>
            );
          }
          return (
        <PostDetailCommentComposer
          ref={controller.refs.commentComposerRef}
          addReplyOptimisticComment={controller.composer.addReplyOptimisticComment}
          addTopLevelOptimisticComment={controller.composer.addTopLevelOptimisticComment}
          baseCommentCount={displayPost?.comments ?? 0}
          currentUser={currentUser}
          decrementCommentCount={controller.composer.decrementCommentCount}
          id={id}
          implicitReplyRoot={effectiveCommentsData?.root}
          incrementCommentCount={controller.composer.incrementCommentCount}
          isLoggedIn={isLoggedIn}
          isViewingComment={isViewingComment}
          onAuthRequired={showAuthSheet}
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
        />
          );
        })()}
        <PostDetailActionSheets
          ref={controller.refs.actionSheetsRef}
          actualRootPostId={focusedThread.actualRootPostId}
          currentUserId={currentUser?.id}
          joinedCommunities={joinedCommunities}
          followedUsers={followedUsers}
          highlight={highlight}
          id={id}
          post={displayPost}
          rootPost={effectiveCommentsData?.root}
        />
      </Box>
    </KeyboardAvoidingView>
    </ModerationProvider>
  );
}
