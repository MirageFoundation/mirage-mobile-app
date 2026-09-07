import { forwardRef, useCallback, useContext, useImperativeHandle, useRef } from "react";
import { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedScrollHandler, type SharedValue } from "react-native-reanimated";
import { SwipeBackGestureContext, SwipeBackGuard } from "@/src/components/ui/swipe-back-guard";

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
  scrollY: SharedValue<number>;
  listHeader: React.ReactElement | null;
  onAuthorPress: (authorId: string) => void;
  onContentSizeChange: (contentHeight?: number) => void;
  onDislikeComment: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  onFollowCommentAuthor: (authorId: string, isCurrentlyFollowing: boolean) => void;
  onHighlightedLayout: (event: Parameters<NonNullable<React.ComponentProps<typeof CommentThread>["onHighlightedLayout"]>>[0]) => void;
  onLikeComment: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  onMoreOptions: (comment: Comment) => void;
  onRetryComments: () => void;
  onReplyToComment: (comment: Comment) => void;
  repliesEnabled?: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: () => void;
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
      scrollY,
      listHeader,
      onAuthorPress,
      onContentSizeChange,
      onDislikeComment,
      onFollowCommentAuthor,
      onHighlightedLayout,
      onLikeComment,
      onMoreOptions,
      onRetryComments,
      onReplyToComment,
      repliesEnabled = true,
      onScroll,
      onScrollBeginDrag,
    },
    ref,
  ) => {
    const gestures = useContext(SwipeBackGestureContext)!;
    const flatListRef = useRef<FlatList<Comment>>(null);
    const commentsLengthRef = useRef(comments.length);
    commentsLengthRef.current = comments.length;
    const forwardScroll = useCallback((event: NativeScrollEvent) => {
      onScroll({ nativeEvent: event } as NativeSyntheticEvent<NativeScrollEvent>);
    }, [onScroll]);
    const handleScroll = useAnimatedScrollHandler((event) => {
      scrollY.value = event.contentOffset.y;
      runOnJS(forwardScroll)(event);
    });

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
        <SwipeBackGuard>
        <CommentThread
          comment={item}
          depth={item.depth ?? 0}
          currentUserId={currentUserId}
          highlightedCommentId={highlightedCommentId}
          onAuthorPress={onAuthorPress}
          onLikePress={onLikeComment}
          onDislikePress={onDislikeComment}
          onReplyPress={repliesEnabled ? onReplyToComment : undefined}
          onMorePress={onMoreOptions}
          followedUsers={followedUsers}
          followLoadingUsers={followLoadingUsers}
          onFollowPress={onFollowCommentAuthor}
          onHighlightedLayout={onHighlightedLayout}
          showDivider={true}
          focusedContextMode={focusedContextMode}
        />
        </SwipeBackGuard>
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
        repliesEnabled,
      ],
    );

    const renderCommentSkeleton = useCallback(
      (index: number, depth: number = 0) => (
        <PostDetailCommentSkeleton key={`skeleton-${index}-${depth}`} depth={depth} />
      ),
      [],
    );

    return (
      <GestureDetector gesture={gestures.native}>
      <Animated.FlatList
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
            onRetry={onRetryComments}
            renderCommentSkeleton={renderCommentSkeleton}
          />
        }
        contentContainerStyle={{
          paddingBottom: contentBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        scrollEventThrottle={16}
        onContentSizeChange={(_width, height) => onContentSizeChange(height)}
        onScrollToIndexFailed={(info) => {
          if (info.index < 0 || info.index >= commentsLengthRef.current) return;
          // averageItemLength x index is wildly wrong for variable-height
          // media comments, so only use it as a rough jump to force the
          // target into the render window, then retry the precise scroll.
          flatListRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: false,
          });
          setTimeout(() => {
            if (info.index < 0 || info.index >= commentsLengthRef.current) return;
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0.1,
            });
          }, 250);
        }}
        // Disabled on all platforms: nested CommentThread rows get incorrectly
        // clipped on Android, hiding the focused reply when opening a post
        // from the inbox. See REACT-NATIVE-BZ.
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={5}
      />
      </GestureDetector>
    );
  },
);

PostDetailCommentsSection.displayName = "PostDetailCommentsSection";
