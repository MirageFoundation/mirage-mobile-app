import {
  type Comment,
  type Post,
} from "@/src/components/molecules";
import type { AnimatedStyle } from "react-native-reanimated";
import { useCallback, useMemo } from "react";
import { FlatList, Platform, RefreshControl } from "react-native";

import { PostDetailCommentListItem } from "./post-detail-comment-list-item";
import { PostDetailEmptyComments } from "./post-detail-empty-comments";
import { PostDetailListHeader } from "./post-detail-list-header";

interface PostDetailCommentsListProps {
  allComments: Comment[];
  currentUserId?: string;
  displayPost: Post | null;
  dividerColor: string;
  errorColor: string;
  followedUsers: string[];
  followLoadingUsers: Set<string>;
  headerAnimatedStyle: AnimatedStyle<any>;
  highlightedCommentId: string | null;
  insetsBottom: number;
  isCommentsError: boolean;
  isLoadingComments: boolean;
  isRefetchingComments: boolean;
  isTopicFollowed: boolean;
  isVideoVisible: boolean;
  listRef: React.RefObject<FlatList<Comment> | null>;
  loadingBackgroundColor: string;
  onAuthorPress: (authorId: string) => void;
  onBlockPost: () => void;
  onBlockPostAuthor: () => void;
  onCommentDislikePress: (
    commentId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes?: number,
  ) => void;
  onCommentFollowPress: (authorId: string, isCurrentlyFollowing: boolean) => void;
  onCommentLikePress: (
    commentId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes?: number,
  ) => void;
  onCommentMorePress: (comment: Comment) => void;
  onCommentReplyPress: (comment: Comment) => void;
  onDislikePost: () => void;
  onEmptyRetry: () => void;
  onFollowPost: () => void;
  onFollowTopic: () => void;
  onLikePost: () => void;
  onPostHeaderLayout: (height: number) => void;
  onPostMorePress: () => void;
  onRefresh: () => void;
  onReportPost: () => void;
  onRevealContent: () => void;
  onScroll: (event: any) => void;
  onScrollToIndexFailed: (index: number, averageItemLength: number) => void;
  onTopicPress: () => void;
  primaryTintColor: string;
  revealedContent: boolean;
  screenActive: boolean;
  shareUrl: string;
  subtleBackgroundColor: string;
  subtleTextColor: string;
  videoSyncScope?: string;
}

export function PostDetailCommentsList({
  allComments,
  currentUserId,
  displayPost,
  dividerColor,
  errorColor,
  followedUsers,
  followLoadingUsers,
  headerAnimatedStyle,
  highlightedCommentId,
  insetsBottom,
  isCommentsError,
  isLoadingComments,
  isRefetchingComments,
  isTopicFollowed,
  isVideoVisible,
  listRef,
  loadingBackgroundColor,
  onAuthorPress,
  onBlockPost,
  onBlockPostAuthor,
  onCommentDislikePress,
  onCommentFollowPress,
  onCommentLikePress,
  onCommentMorePress,
  onCommentReplyPress,
  onDislikePost,
  onEmptyRetry,
  onFollowPost,
  onFollowTopic,
  onLikePost,
  onPostHeaderLayout,
  onPostMorePress,
  onRefresh,
  onReportPost,
  onRevealContent,
  onScroll,
  onScrollToIndexFailed,
  onTopicPress,
  primaryTintColor,
  revealedContent,
  screenActive,
  shareUrl,
  subtleBackgroundColor,
  subtleTextColor,
  videoSyncScope,
}: PostDetailCommentsListProps) {
  const listHeader = useMemo(
    () => (
      <PostDetailListHeader
        displayPost={displayPost}
        currentUserId={currentUserId}
        isVideoVisible={isVideoVisible}
        isTopicFollowed={isTopicFollowed}
        screenActive={screenActive}
        onAuthorPress={() => {
          if (displayPost) {
            onAuthorPress(displayPost.author.id);
          }
        }}
        onTopicPress={onTopicPress}
        onLikePress={onLikePost}
        onDislikePress={onDislikePost}
        onFollowUser={onFollowPost}
        onFollowTopic={onFollowTopic}
        onMorePress={onPostMorePress}
        onBlockUser={onBlockPostAuthor}
        onBlockPost={onBlockPost}
        onReport={onReportPost}
        onRevealContent={onRevealContent}
        contentRevealed={revealedContent}
        shareUrl={shareUrl}
        videoSyncScope={videoSyncScope}
        onLayout={onPostHeaderLayout}
        animatedStyle={headerAnimatedStyle}
        dividerColor={dividerColor}
        loadingBackgroundColor={loadingBackgroundColor}
      />
    ),
    [
      currentUserId,
      displayPost,
      dividerColor,
      headerAnimatedStyle,
      isTopicFollowed,
      isVideoVisible,
      loadingBackgroundColor,
      onAuthorPress,
      onBlockPost,
      onBlockPostAuthor,
      onDislikePost,
      onFollowPost,
      onFollowTopic,
      onLikePost,
      onPostHeaderLayout,
      onPostMorePress,
      onReportPost,
      onRevealContent,
      onTopicPress,
      revealedContent,
      screenActive,
      shareUrl,
      videoSyncScope,
    ],
  );

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <PostDetailCommentListItem
        item={item}
        currentUserId={currentUserId}
        highlightedCommentId={highlightedCommentId}
        followedUsers={followedUsers}
        followLoadingUsers={followLoadingUsers}
        onAuthorPress={onAuthorPress}
        onLikePress={onCommentLikePress}
        onDislikePress={onCommentDislikePress}
        onReplyPress={onCommentReplyPress}
        onMorePress={onCommentMorePress}
        onFollowPress={onCommentFollowPress}
      />
    ),
    [
      currentUserId,
      followedUsers,
      followLoadingUsers,
      highlightedCommentId,
      onAuthorPress,
      onCommentDislikePress,
      onCommentFollowPress,
      onCommentLikePress,
      onCommentMorePress,
      onCommentReplyPress,
    ],
  );

  const renderEmpty = useCallback(
    () => (
      <PostDetailEmptyComments
        isLoading={isLoadingComments}
        isError={isCommentsError}
        subtleBackgroundColor={subtleBackgroundColor}
        subtleTextColor={subtleTextColor}
        errorColor={errorColor}
        borderColor={dividerColor}
        onRetry={onEmptyRetry}
      />
    ),
    [
      dividerColor,
      errorColor,
      isCommentsError,
      isLoadingComments,
      onEmptyRetry,
      subtleBackgroundColor,
      subtleTextColor,
    ],
  );

  const keyExtractor = useCallback((item: Comment) => item.id, []);

  return (
    <FlatList
      ref={listRef}
      data={allComments}
      renderItem={renderComment}
      keyExtractor={keyExtractor}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={{
        paddingBottom: insetsBottom + 60,
      }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={isRefetchingComments}
          onRefresh={onRefresh}
          tintColor={primaryTintColor}
        />
      }
      onScrollToIndexFailed={(info) => {
        onScrollToIndexFailed(info.index, info.averageItemLength);
      }}
      removeClippedSubviews={Platform.OS === "android"}
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={5}
    />
  );
}
