import { transformApiComments, useComments, useUserFollowed } from "@/src/api/read";
import * as Sentry from "@sentry/react-native";
import { parseApiError } from "@/src/utils/parse-api-error";
import { queryKeys } from "@/src/api/read/query-keys";
import {
  Comment,
  MediaPostDetailSkeleton,
} from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { useAuthGuard } from "@/src/hooks";
import {
  useAuthStore,
  useContentModerationStore,
  useUIStore,
  usePreferencesStore,
} from "@/src/stores";
import {
  useOptimisticReplyComments,
  useOptimisticTopLevelComments,
  usePostCommentOptimisticStore,
} from "@/src/stores/post-comment-optimistic-store";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { getLastPressedPostY } from "@/src/utils/post-transition";
import { useQueryClient } from "@tanstack/react-query";
import MediaPostDetailScreen from "@/src/pages/post/media-post-detail-screen";
import { PostDetailActionSheets, type PostDetailActionSheetsRef } from "./post-detail-action-sheets";
import { PostDetailCommentComposer, type PostDetailCommentComposerRef } from "./post-detail-comment-composer";
import { PostDetailCommentsSection, type PostDetailCommentsSectionRef } from "./post-detail-comments-section";
import { PostDetailHeader } from "./post-detail-header";
import { PostDetailNotFound } from "./post-detail-not-found";
import { PostDetailPostSection } from "./post-detail-post-section";
import { PostDetailStickySummary } from "./post-detail-sticky-summary";
import {
  buildPostDetailComments,
  countCommentsInTree,
  findTopLevelBranchForComment,
  hasMoreRepliesInBranch,
  mergePostDetailComments,
} from "./post-detail-comment-utils";
import { usePostDetailMediaRoute } from "./use-post-detail-media-route";
import { usePostDetailCommentVoting } from "./use-post-detail-comment-voting";
import { usePostDetailCommentsLifecycle } from "./use-post-detail-comments-lifecycle";
import { usePostDetailFocusedThread } from "./use-post-detail-focused-thread";
import { usePostDetailHighlightScroll } from "./use-post-detail-highlight-scroll";
import { usePostDetailPendingCommentEdit } from "./use-post-detail-pending-comment-edit";
import { usePostDetailPostState } from "./use-post-detail-post-state";
import { usePostDetailResolvedPost } from "./use-post-detail-resolved-post";
import { usePostDetailStickyHeader } from "./use-post-detail-sticky-header";
import { styles } from "./post-detail-styles";

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    highlight?: string;
    depth?: string;
  }>();
  const {
    isResolvingFocusedMediaRoute,
    routeHighlightCommentId,
    routeRootPostId,
    useImmersive,
  } = usePostDetailMediaRoute(params);

  if (!useImmersive && isResolvingFocusedMediaRoute) {
    return <MediaPostDetailSkeleton />;
  }

  if (useImmersive) {
    return (
      <MediaPostDetailScreen
        rootPostId={routeRootPostId ?? undefined}
        highlightCommentId={routeHighlightCommentId}
        initialSheetOpen={!!routeHighlightCommentId}
      />
    );
  }

  return <LegacyPostDetailScreen />;
}

function LegacyPostDetailScreen() {
  const { id, highlight, reveal, syncContext, depth } = useLocalSearchParams<{
    id: string;
    highlight?: string;
    reveal?: string;
    syncContext?: string;
    depth?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const videoSyncScope = syncContext ?? (id ? `post:${id}` : undefined);

  const pressedY = useMemo(() => getLastPressedPostY(), []);
  const headerHeight = insets.top + 40;
  const initialTranslateY = pressedY > 0 ? pressedY - headerHeight : 0;

  const postTranslateY = useSharedValue(initialTranslateY);
  const postOpacity = useSharedValue(pressedY > 0 ? 0 : 1);

  useEffect(() => {
    if (pressedY > 0) {
      postOpacity.value = withTiming(1, { duration: 200 });
      postTranslateY.value = withTiming(0, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, []);

  const postEnteringStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: postTranslateY.value }],
    opacity: postOpacity.value,
  }));
  const { theme } = useUnistyles();
  const { requireAuth, isLoggedIn } = useAuthGuard();

  const currentUser = useAuthStore((s) => s.user);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const setActiveFeedScreen = useHomePostCardStore((s) => s.setActiveFeedScreen);
  const actionSheetsRef = useRef<PostDetailActionSheetsRef>(null);
  const commentComposerRef = useRef<PostDetailCommentComposerRef>(null);
  const commentsSectionRef = useRef<PostDetailCommentsSectionRef>(null);

  const isFocused = useIsFocused();

  useEffect(() => {
    setActiveFeedScreen(null);
  }, [setActiveFeedScreen]);

  useEffect(() => {
    if (highlight && id) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comments(id, currentUser?.walletAddress ?? undefined),
      });
    }
  }, []);

  // Fetch comments from API
  const {
    data: commentsData,
    isLoading: isLoadingComments,
    isError: isCommentsError,
    error: commentsError,
    isFetching: isFetchingComments,
    refetch: refetchComments,
    isRefetching: isRefetchingComments,
  } = useComments(id, { enabled: isFocused });

  const commentsApiError = useMemo(() => {
    if (!commentsError) return null;
    return parseApiError(commentsError);
  }, [commentsError]);

  const isPostNotFound = commentsApiError?.errorCode === "post_not_found" || commentsApiError?.httpStatus === 404;

  const {
    lastCommentsFetchRef,
    refetchCommentsRef,
    screenActive,
  } = usePostDetailCommentsLifecycle({
    currentUserWallet: currentUser?.walletAddress ?? undefined,
    id,
    isFetchingComments,
    isPostNotFound,
    queryClient,
    refetchComments,
  });

  const isViewingComment = useMemo(() => {
    const root = commentsData?.root;
    if (!root?.post_id || !root.root_post_id) return false;
    return root.root_post_id.toLowerCase() !== root.post_id.toLowerCase();
  }, [commentsData?.root]);

  const {
    actualRootPost,
    actualRootPostId,
    contextComments,
    contextDepth,
    focusedCommentData,
    focusedCommentId,
    focusedContextCheckQuery,
    fullThreadCommentsData,
    hasLoadedFocusedContext,
    isLoadingContext,
    isLoadingFocusedComment,
    isLoadingFullThreadComments,
    loadFocusedContext,
    optimisticThreadId,
    setContextComments,
    setShowFocusedThread,
    showFocusedThread,
  } = usePostDetailFocusedThread({
    commentsData,
    currentUserWallet: currentUser?.walletAddress ?? undefined,
    depth,
    highlight,
    id,
    isFocused,
    isViewingComment,
    queryClient,
  });

  // Fetch user's followed list
  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );

  const { post } = usePostDetailResolvedPost({
    actualRootPost,
    actualRootPostId,
    commentsData,
    currentUser,
    followedUsers,
    id,
    isViewingComment,
    queryClient,
  });

  const {
    displayPost,
    handleFollowCommentAuthor,
    setLocalPostUpdates,
  } = usePostDetailPostState({
    id,
    post,
  });

  const incrementCommentCount = useHomePostCardStore(
    (state) => state.incrementCommentCount,
  );
  const decrementCommentCount = useHomePostCardStore(
    (state) => state.decrementCommentCount,
  );

  // Track follow loading state
  const [followLoadingUsers] = useState<Set<string>>(
    new Set(),
  );

  const globalHiddenCommentIds = useContentModerationStore(
    (s) => s.hiddenCommentIds,
  );
  const globalBlockedUserIds = useContentModerationStore(
    (s) => s.blockedUserIds,
  );
  const [revealFocusedBranch, setRevealFocusedBranch] = useState(false);
  const branchExpansionReportRef = useRef<string | null>(null);

  useEffect(() => {
    setRevealFocusedBranch(false);
    branchExpansionReportRef.current = null;
  }, [id, focusedCommentId]);

  const comments = useMemo(() => {
    return buildPostDetailComments({
      actualRootPostId,
      commentsData,
      contextComments,
      contextDepth,
      focusedCommentData,
      focusedCommentId,
      fullThreadCommentsData,
      isLoadingContext,
      isViewingComment,
      revealFocusedBranch,
      showFocusedThread,
    });
  }, [
    commentsData,
    focusedCommentData,
    fullThreadCommentsData,
    focusedCommentId,
    showFocusedThread,
    isViewingComment,
    actualRootPostId,
    contextComments,
    contextDepth,
    isLoadingContext,
    revealFocusedBranch,
  ]);

  const availableFocusedContextCount = useMemo(() => {
    if (!focusedCommentId) return 0;
    const rootId = actualRootPostId?.toLowerCase();
    const focusedId = focusedCommentId.toLowerCase();
    return (focusedContextCheckQuery.data?.context ?? [])
      .filter((comment) => {
        const contextPostId = comment.post_id.toLowerCase();
        return contextPostId !== rootId && contextPostId !== focusedId;
      }).length;
  }, [focusedCommentId, actualRootPostId, focusedContextCheckQuery.data]);

  const loadedFocusedContextCount = useMemo(() => {
    if (!focusedCommentId) return 0;
    const rootId = actualRootPostId?.toLowerCase();
    const focusedId = focusedCommentId.toLowerCase();
    return contextComments.filter((comment) => {
      const contextPostId = comment.post_id.toLowerCase();
      return contextPostId !== rootId && contextPostId !== focusedId;
    }).length;
  }, [focusedCommentId, actualRootPostId, contextComments]);

  const hasAvailableFocusedAncestors = availableFocusedContextCount > 0;

  const hasFullThreadBeyondFocus = useMemo(() => {
    if (!focusedCommentId) return false;
    const focusedCount = countCommentsInTree(comments);
    const fullCount = Math.max(post?.comments ?? 0, actualRootPost?.comments ?? 0);
    return fullCount > focusedCount;
  }, [focusedCommentId, comments, post?.comments, actualRootPost?.comments]);

  const [threadActionLoading, setThreadActionLoading] = useState<
    "context" | "full" | null
  >(null);
  useEffect(() => {
    setThreadActionLoading(null);
  }, [id]);
  const optimisticTopLevelComments = useOptimisticTopLevelComments(optimisticThreadId);
  const optimisticReplyComments = useOptimisticReplyComments(optimisticThreadId);
  const addTopLevelOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.addTopLevelComment,
  );
  const addReplyOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.addReplyComment,
  );
  const replaceOptimisticCommentId = usePostCommentOptimisticStore(
    (state) => state.replaceCommentId,
  );
  const removeOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.removeComment,
  );
  const pruneCommentsPresentOnServer = usePostCommentOptimisticStore(
    (state) => state.pruneCommentsPresentOnServer,
  );

  // Vote overrides for comments (tracks hasLiked, hasDisliked, and likeDelta)

  // Track if initial comments have loaded (to avoid clearing optimistic on first load)
  const hasInitialCommentsLoaded = useRef(false);

  // Clean up optimistic comments when server data is refreshed
  // This prevents duplicates when user pulls to refresh after posting
  useEffect(() => {
    if (!id || !commentsData?.children) return;
    if (focusedCommentId && showFocusedThread) return;

    if (!hasInitialCommentsLoaded.current) {
      hasInitialCommentsLoaded.current = true;
      return;
    }

    pruneCommentsPresentOnServer(optimisticThreadId, comments);
  }, [commentsData?.children, comments, focusedCommentId, id, optimisticThreadId, pruneCommentsPresentOnServer, showFocusedThread]);
  const {
    commentVoteOverrides,
    handleDislikeComment,
    handleLikeComment,
  } = usePostDetailCommentVoting();

  const [commentEditOverrides, setCommentEditOverrides] = useState<
    Record<string, string>
  >({});

  // Merge API comments with locally added comments and apply vote overrides + optimistic replies
  // Filter hidden/blocked and sort by createdAt descending (latest first)
  const allComments = useMemo(() => {
    return mergePostDetailComments({
      blockedUserIds: globalBlockedUserIds,
      commentEditOverrides,
      commentVoteOverrides,
      comments,
      globalHiddenCommentIds,
      hiddenCommentIds: globalHiddenCommentIds,
      optimisticReplyComments,
      optimisticTopLevelComments,
    });
  }, [
    commentEditOverrides,
    commentVoteOverrides,
    comments,
    globalBlockedUserIds,
    globalHiddenCommentIds,
    optimisticReplyComments,
    optimisticTopLevelComments,
  ]);

  const fullBranchComments = useMemo(() => {
    const source = isViewingComment
      ? fullThreadCommentsData?.children
      : commentsData?.children;
    return transformApiComments(source ?? []);
  }, [isViewingComment, fullThreadCommentsData?.children, commentsData?.children]);

  const hasFocusedBranchReplies = useMemo(
    () => hasMoreRepliesInBranch(comments, fullBranchComments, focusedCommentId),
    [comments, fullBranchComments, focusedCommentId],
  );

  useEffect(() => {
    if (!revealFocusedBranch || !focusedCommentId || fullBranchComments.length === 0) return;
    const reportKey = `${id}:${focusedCommentId}`;
    if (branchExpansionReportRef.current === reportKey) return;
    const branch = findTopLevelBranchForComment(fullBranchComments, focusedCommentId);
    branchExpansionReportRef.current = reportKey;
    if (branch) {
      Sentry.addBreadcrumb({
        category: "comments",
        message: "Expanded focused comment branch",
        data: {
          postId: id,
          focusedCommentId,
          branchId: branch.id,
          branchCommentCount: countCommentsInTree([branch]),
          screen: "post-detail",
        },
        level: "info",
      });
      return;
    }

    Sentry.captureMessage("Focused branch expansion requested but branch was not found", {
      level: "warning",
      tags: { feature: "comments", operation: "focused-branch-expand" },
      extra: {
        postId: id,
        focusedCommentId,
        rootPostId: actualRootPostId,
        fullBranchRootCount: fullBranchComments.length,
        screen: "post-detail",
      },
    });
  }, [revealFocusedBranch, focusedCommentId, fullBranchComments, id, actualRootPostId]);

  const hasFocusedRecentContext = hasAvailableFocusedAncestors || hasFocusedBranchReplies;

  const recentContextDone =
    !hasFocusedBranchReplies &&
    (contextDepth > 0 || hasLoadedFocusedContext) &&
    focusedContextCheckQuery.isFetched &&
    hasAvailableFocusedAncestors &&
    loadedFocusedContextCount >= availableFocusedContextCount;

  const {
    currentScrollYRef,
    handleComposerConfirmedCommentId: handleHighlightConfirmedCommentId,
    handleComposerHighlight,
    handleComposerScrollToEnd,
    handleContentSizeChange,
    handleHighlightedCommentLayout,
    highlightedCommentId,
  } = usePostDetailHighlightScroll({
    allComments,
    commentsSectionRef,
    contextDepth,
    focusedCommentId,
    highlight,
    id,
    insetsTop: insets.top,
    isFetchingComments,
    isLoadingComments,
    isLoadingContext,
    lastCommentsFetchRef,
    refetchCommentsRef,
  });

  const {
    handlePostHeaderLayout,
    handleScroll,
    isStickyInteractive,
    isVideoVisible,
    stickyHeaderAnimatedStyle,
  } = usePostDetailStickyHeader({ currentScrollYRef });

  // Format count for display
  const formatCount = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  // Handlers
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleReplyToComment = useCallback((comment: Comment) => {
    commentComposerRef.current?.startReply(comment);
  }, []);

  const handleMoreOptions = useCallback((comment: Comment) => {
    actionSheetsRef.current?.presentCommentOptions(comment);
  }, []);

  usePostDetailPendingCommentEdit({
    id,
    onEditedComment: handleComposerHighlight,
    refetchComments,
    setCommentEditOverrides,
  });

  const renderHeader = useMemo(
    () => (
      <PostDetailHeader
        topic={displayPost?.topic}
        insetsTop={insets.top}
        onBack={handleBack}
        onTopicPress={
          displayPost?.topic
            ? () =>
                router.push(`/topic/${encodeURIComponent(displayPost.topic!)}`)
            : undefined
        }
        onOptionsPress={
          displayPost
            ? () => actionSheetsRef.current?.presentPostOptions()
            : undefined
        }
      />
    ),
    [insets.top, handleBack, displayPost, router],
  );

  const listHeader = useMemo(
    () => (
      <PostDetailPostSection
        actionSheetsRef={actionSheetsRef}
        actualRootPostId={actualRootPostId}
        contentInitiallyRevealed={reveal === "true"}
        currentUserId={currentUser?.id}
        focusedCommentId={focusedCommentId}
        followedTopics={followedTopics}
        hasFocusedRecentContext={hasFocusedRecentContext}
        hasFullThreadBeyondFocus={hasFullThreadBeyondFocus}
        id={id}
        isVideoVisible={isVideoVisible}
        loadFocusedContext={async (loadDepth) => {
          setRevealFocusedBranch(true);
          await loadFocusedContext(loadDepth);
        }}
        onLayout={handlePostHeaderLayout}
        onShowFullThread={() => {
          setShowFocusedThread(false);
          setContextComments([]);
        }}
        post={displayPost}
        postEnteringStyle={postEnteringStyle}
        recentContextDone={recentContextDone}
        screenActive={screenActive}
        setThreadActionLoading={setThreadActionLoading}
        shareServer={shareServer}
        threadActionLoading={threadActionLoading}
        videoSyncScope={videoSyncScope}
      />
    ),
    [
      actualRootPostId,
      currentUser?.id,
      displayPost,
      focusedCommentId,
      followedTopics,
      handlePostHeaderLayout,
      hasFocusedRecentContext,
      hasFullThreadBeyondFocus,
      id,
      isVideoVisible,
      loadFocusedContext,
      postEnteringStyle,
      recentContextDone,
      reveal,
      screenActive,
      shareServer,
      threadActionLoading,
      videoSyncScope,
    ],
  );

  const handleComposerConfirmedCommentId = useCallback(
    (optimisticCommentId: string, confirmedCommentId: string) => {
      handleHighlightConfirmedCommentId(optimisticCommentId, confirmedCommentId);
      actionSheetsRef.current?.replaceSelectedCommentId(
        optimisticCommentId,
        confirmedCommentId,
      );
    },
    [handleHighlightConfirmedCommentId],
  );

  const handleComposerCommentCountDelta = useCallback(
    (delta: number, fallbackBase: number) => {
      setLocalPostUpdates((prev) => ({
        ...prev,
        comments: Math.max(0, (prev.comments ?? fallbackBase) + delta),
      }));
    },
    [setLocalPostUpdates],
  );

  const handleComposerClearFocusedThread = useCallback(() => {
    setShowFocusedThread(false);
    setContextComments([]);
  }, []);

  const handleComposerRefetchAfterSuccess = useCallback(() => {
    refetchCommentsRef.current?.(true);
  }, []);

  if (isPostNotFound) {
    return (
      <PostDetailNotFound
        header={renderHeader}
        message={commentsApiError?.message}
        onBack={() => router.back()}
        theme={theme}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
      <Box flex background="base">
        {/* Header */}
        {renderHeader}

        <PostDetailStickySummary
          animatedStyle={stickyHeaderAnimatedStyle}
          formatCount={formatCount}
          insetsTop={insets.top}
          isInteractive={isStickyInteractive}
          post={displayPost}
          theme={theme}
        />

        <PostDetailCommentsSection
          ref={commentsSectionRef}
          comments={allComments}
          commentsCount={commentsData?.children?.length ?? 0}
          contentBottomPadding={insets.bottom + 60}
          currentUserId={currentUser?.id}
          followedUsers={followedUsers}
          followLoadingUsers={followLoadingUsers}
          highlightedCommentId={highlightedCommentId}
          isCommentsError={isCommentsError}
          isFetchingComments={isFetchingComments}
          isLoadingComments={isLoadingComments}
          isLoadingContext={isLoadingContext}
          isLoadingFocusedComment={isLoadingFocusedComment}
          isLoadingFullThreadComments={isLoadingFullThreadComments}
          isRefetchingComments={isRefetchingComments}
          listHeader={listHeader}
          onAuthorPress={(authorId) => router.push(`/user/${authorId}`)}
          onContentSizeChange={handleContentSizeChange}
          onDislikeComment={handleDislikeComment}
          onFollowCommentAuthor={handleFollowCommentAuthor}
          onHighlightedLayout={handleHighlightedCommentLayout}
          onLikeComment={handleLikeComment}
          onMoreOptions={handleMoreOptions}
          onRefreshComments={refetchComments}
          onReplyToComment={handleReplyToComment}
          onScroll={handleScroll}
        />

        <PostDetailCommentComposer
          ref={commentComposerRef}
          addReplyOptimisticComment={addReplyOptimisticComment}
          addTopLevelOptimisticComment={addTopLevelOptimisticComment}
          baseCommentCount={displayPost?.comments ?? 0}
          currentUser={currentUser}
          decrementCommentCount={decrementCommentCount}
          focusedCommentId={focusedCommentId}
          id={id}
          implicitReplyRoot={commentsData?.root}
          incrementCommentCount={incrementCommentCount}
          isLoggedIn={isLoggedIn}
          isViewingComment={isViewingComment}
          onAuthRequired={showAuthSheet}
          onClearFocusedThread={handleComposerClearFocusedThread}
          onCommentCountDelta={handleComposerCommentCountDelta}
          onConfirmedCommentId={handleComposerConfirmedCommentId}
          onHighlightComment={handleComposerHighlight}
          onRefetchAfterSuccess={handleComposerRefetchAfterSuccess}
          onScrollToEndAfterLayout={handleComposerScrollToEnd}
          optimisticThreadId={optimisticThreadId}
          post={displayPost}
          removeOptimisticComment={removeOptimisticComment}
          replaceOptimisticCommentId={replaceOptimisticCommentId}
          requireAuth={requireAuth}
          rootPostCommentCount={post?.comments ?? 0}
          showFocusedThread={showFocusedThread}
        />

        <PostDetailActionSheets
          ref={actionSheetsRef}
          actualRootPostId={actualRootPostId}
          currentUserId={currentUser?.id}
          followedTopics={followedTopics}
          followedUsers={followedUsers}
          highlight={highlight}
          id={id}
          post={displayPost}
          rootPost={commentsData?.root}
        />
      </Box>
    </KeyboardAvoidingView>
  );
}
