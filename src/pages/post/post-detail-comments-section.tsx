import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Platform, RefreshControl } from "react-native";
import Animated, { FadeInUp, LinearTransition } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Comment, CommentThread } from "@/src/components/molecules";
import { PostDetailEmptyComments } from "./post-detail-empty-comments";
import { PostDetailCommentSkeleton } from "./post-detail-comment-skeleton";

type ScrollToOffsetOptions = {
  offset: number;
  animated?: boolean;
};

export type PostDetailCommentsSectionRef = {
  scrollToEnd: (options?: { animated?: boolean }) => void;
  scrollToIndex: (options: { index: number; animated?: boolean; viewPosition?: number }) => void;
  scrollToOffset: (options: ScrollToOffsetOptions) => void;
};

type PostDetailCommentsSectionProps = {
  comments: Comment[];
  commentsCount: number;
  contentBottomPadding: number;
  currentUserId?: string;
  focusedContextMode?: boolean;
  followedUsers: string[];
  followLoadingUsers: Set<string>;
  highlightedCommentId: string | null;
  isCommentsError: boolean;
  isFetchingComments: boolean;
  isLoadingComments: boolean;
  isLoadingContext: boolean;
  isLoadingFocusedComment: boolean;
  isLoadingFullThreadComments: boolean;
  isRefetchingComments: boolean;
  listHeader: React.ReactElement | null;
  onAuthorPress: (authorId: string) => void;
  onContentSizeChange: () => void;
  onDislikeComment: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  onFollowCommentAuthor: (authorId: string, isCurrentlyFollowing: boolean) => void;
  onHighlightedLayout: (event: Parameters<NonNullable<React.ComponentProps<typeof CommentThread>["onHighlightedLayout"]>>[0]) => void;
  onLikeComment: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  onMoreOptions: (comment: Comment) => void;
  onRefreshComments: () => void;
  onReplyToComment: (comment: Comment) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

export const PostDetailCommentsSection = forwardRef<
  PostDetailCommentsSectionRef,
  PostDetailCommentsSectionProps
>(
  (
    {
      comments,
      commentsCount,
      contentBottomPadding,
      currentUserId,
      focusedContextMode = false,
      followedUsers,
      followLoadingUsers,
      highlightedCommentId,
      isCommentsError,
      isFetchingComments,
      isLoadingComments,
      isLoadingContext,
      isLoadingFocusedComment,
      isLoadingFullThreadComments,
      isRefetchingComments,
      listHeader,
      onAuthorPress,
      onContentSizeChange,
      onDislikeComment,
      onFollowCommentAuthor,
      onHighlightedLayout,
      onLikeComment,
      onMoreOptions,
      onRefreshComments,
      onReplyToComment,
      onScroll,
    },
    ref,
  ) => {
    const { theme } = useUnistyles();
    const flatListRef = useRef<FlatList<Comment>>(null);
    const commentsLengthRef = useRef(comments.length);
    commentsLengthRef.current = comments.length;

    useImperativeHandle(
      ref,
      () => ({
        scrollToEnd: (options) => flatListRef.current?.scrollToEnd(options),
        scrollToIndex: (options) => flatListRef.current?.scrollToIndex(options),
        scrollToOffset: (options) => flatListRef.current?.scrollToOffset(options),
      }),
      [],
    );

    const renderComment = useCallback(
      ({ item }: { item: Comment }) => (
        <Animated.View
          entering={FadeInUp.duration(250).delay(100)}
          layout={LinearTransition.duration(250)}
        >
          <CommentThread
            comment={item}
            depth={item.depth ?? 0}
            currentUserId={currentUserId}
            highlightedCommentId={highlightedCommentId}
            onAuthorPress={onAuthorPress}
            onLikePress={onLikeComment}
            onDislikePress={onDislikeComment}
            onReplyPress={onReplyToComment}
            onMorePress={onMoreOptions}
            followedUsers={followedUsers}
            followLoadingUsers={followLoadingUsers}
            onFollowPress={onFollowCommentAuthor}
            onHighlightedLayout={onHighlightedLayout}
            showDivider={true}
            focusedContextMode={focusedContextMode}
          />
        </Animated.View>
      ),
      [
        currentUserId,
        focusedContextMode,
        followedUsers,
        followLoadingUsers,
        highlightedCommentId,
        onAuthorPress,
        onDislikeComment,
        onFollowCommentAuthor,
        onHighlightedLayout,
        onLikeComment,
        onMoreOptions,
        onReplyToComment,
      ],
    );

    const renderCommentSkeleton = useCallback(
      (index: number, depth: number = 0) => (
        <PostDetailCommentSkeleton key={`skeleton-${index}-${depth}`} depth={depth} />
      ),
      [],
    );

    return (
      <FlatList
        ref={flatListRef}
        data={comments}
        renderItem={renderComment}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <PostDetailEmptyComments
            commentsCount={commentsCount}
            isCommentsError={isCommentsError}
            isFetchingComments={isFetchingComments}
            isLoadingComments={isLoadingComments}
            isLoadingContext={isLoadingContext}
            isLoadingFocusedComment={isLoadingFocusedComment}
            isLoadingFullThreadComments={isLoadingFullThreadComments}
            onRetry={onRefreshComments}
            renderCommentSkeleton={renderCommentSkeleton}
          />
        }
        contentContainerStyle={{
          paddingBottom: contentBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingComments}
            onRefresh={onRefreshComments}
            tintColor={theme.colors.primary[500]}
          />
        }
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            if (info.index < 0 || info.index >= commentsLengthRef.current) return;
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }, 100);
        }}
        removeClippedSubviews={Platform.OS === "android"}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={5}
      />
    );
  },
);

PostDetailCommentsSection.displayName = "PostDetailCommentsSection";
