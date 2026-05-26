/**
 * MediaPostDetailScreen
 *
 * Immersive post-detail layout for posts that contain image, video, or gif
 * media.
 *
 * Layout:
 *   - Header (absolute top, below safe-area inset): ✕ / topic / ⋯
 *   - Media (absolute, starts just below header): full screen width, height
 *     interpolates from "remaining screen" (expanded) to 30% screen height
 *     (collapsed). resizeMode "contain".
 *   - Footer (absolute bottom, expanded only): avatar+username, title,
 *     body, video controls (draggable seek + time), action row
 *     (vote / comment | block-options / share). Fades out on collapse.
 *   - Comment sheet (the scrollable list underneath): once collapsed,
 *     shows handle bar, divider, avatar+username, title, body, then
 *     "Comments (N)" header, then comments.
 *   - Sticky CommentInput (absolute bottom): visible only when collapsed.
 *
 * Gesture model:
 *   - Single `scrollY` shared value drives all collapse interpolation.
 *   - The comments list's onScroll updates scrollY.
 *   - A Pan gesture on the media also updates scrollY (so dragging the
 *     media collapses/expands directly).
 *   - On release, snaps to fully expanded or fully collapsed based on
 *     position + velocity.
 *   - Tapping the media when collapsed expands it back; tapping when
 *     expanded toggles video play/pause.
 */

import {
  CommentInput,
  CommentInputRef,
  MediaPostDetailSkeleton,
  type Comment,
} from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import {
  useAuthGuard,
  useFollowHandler,
  useVoteHandler,
} from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import {
  getShareBaseUrl,
  useAuthStore,
  usePreferencesStore,
} from "@/src/stores";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { resolvePostContent } from "@/src/components/molecules/post-card-utils";
import {
  MediaPostDetailActionSheets,
  type MediaPostDetailActionSheetsRef,
} from "./media-post-detail-action-sheets";
import { MediaPostDetailCommentSheet } from "./media-post-detail-comment-sheet";
import { MediaPostDetailGallery } from "./media-post-detail-gallery";
import { MediaPostDetailHeader } from "./media-post-detail-header";
import { type MediaItem } from "./media-post-detail-media-item";
import { MediaPostDetailNotFound } from "./media-post-detail-not-found";
import { styles } from "./media-post-detail-styles";
import { useMediaPostDetailData } from "./use-media-post-detail-data";
import { useMediaPostDetailLayout } from "./use-media-post-detail-layout";
import { useMediaPostDetailPendingComment } from "./use-media-post-detail-pending-comment";
import { usePostDetailPendingCommentEdit } from "./use-post-detail-pending-comment-edit";
import { useMediaPostDetailVideoControls } from "./use-media-post-detail-video-controls";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutChangeEvent,
  Share,
  UIManager,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLastPressedMediaTransition } from "@/src/utils/post-transition";

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type MediaPostDetailScreenProps = {
  rootPostId?: string;
  highlightCommentId?: string;
  initialSheetOpen?: boolean;
};

export default function MediaPostDetailScreen({
  rootPostId,
  highlightCommentId,
  initialSheetOpen = false,
}: MediaPostDetailScreenProps = {}) {
  const params = useLocalSearchParams<{
    id: string;
    highlight?: string;
    depth?: string;
    syncContext?: string;
  }>();
  const id = rootPostId ?? params.id;
  const initialHighlightCommentId = highlightCommentId ?? params.highlight;
  const shouldOpenSheetInitially = initialSheetOpen || !!initialHighlightCommentId || !!params.depth;
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(
    initialHighlightCommentId ?? null,
  );
  const [focusedMode, setFocusedMode] = useState<"single" | "context" | "full">(
    initialHighlightCommentId ? "context" : "full",
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { isLoggedIn, requireAuth } = useAuthGuard();
  const videoSyncScope = params.syncContext ?? (id ? `post:${id}` : undefined);
  const sourceMediaTransition = useMemo(() => getLastPressedMediaTransition(), []);

  const currentUser = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const setActiveFeedScreen = useHomePostCardStore((s) => s.setActiveFeedScreen);

  const commentsListRef = useRef<any>(null);
  const commentsScrollYRef = useRef(0);
  const preciseScrollTargetRef = useRef<string | null>(null);
  const coarseScrollTargetRef = useRef<string | null>(null);
  const focusedInitialScrollTargetRef = useRef<string | null>(null);
  const pendingScrollToEndRef = useRef(false);
  const pendingReplyScrollIdRef = useRef<string | null>(null);
  const displayCommentsLengthRef = useRef(0);
  const actionSheetsRef = useRef<MediaPostDetailActionSheetsRef>(null);
  const commentInputRef = useRef<CommentInputRef>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(
    initialHighlightCommentId ?? null,
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressedHighlightScrollRef = useRef<string | null>(null);
  const composeNavigationLockedUntilRef = useRef(0);

  const reserveComposeNavigation = useCallback(() => {
    const now = Date.now();
    if (now < composeNavigationLockedUntilRef.current) return false;
    composeNavigationLockedUntilRef.current = now + 1000;
    return true;
  }, []);

  useEffect(() => {
    preciseScrollTargetRef.current = null;
    coarseScrollTargetRef.current = null;
  }, [highlightedCommentId]);

  useEffect(() => {
    setActiveFeedScreen(null);
  }, [setActiveFeedScreen]);

  const {
    blockCommentAuthor,
    commentVote,
    displayComments,
    followedTopics,
    followedUsers,
    hasFullThreadBeyondFocus,
    isLoadingComments,
    isLoadingFocusedComment,
    isLoadingFocusedContextThread,
    post,
    recentContextDisabled,
    recentContextDone,
    refetchComments,
    setCommentEditOverrides,
    setFocusedContextDepth,
    removeCommentFromState,
  } = useMediaPostDetailData({
    commentsListRef,
    currentUser,
    displayCommentsLengthRef,
    focusedCommentId,
    focusedMode,
    highlightedCommentId,
    id,
    isFocused,
    pendingScrollToEndRef,
  });

  const { handleFollowUser: followUser, handleFollowTopic: followTopic } =
    useFollowHandler({});

  const handleRemoveComment = useCallback(
    (commentId: string) => {
      removeCommentFromState(commentId);
      if (commentId === focusedCommentId && focusedMode !== "full") {
        setFocusedCommentId(null);
        setFocusedMode("full");
        setHighlightedCommentId(null);
      }
    },
    [focusedCommentId, focusedMode, removeCommentFromState],
  );

  // --- handlers -----------------------------------------------------------
  const setVoteOverride = useHomePostCardStore((s) => s.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((s) => s.clearVoteOverride);
  const postVote = useVoteHandler({
    onOptimisticUpdate: (targetId, result) => {
      setVoteOverride(targetId, {
        hasLiked: result.hasLiked,
        hasDisliked: result.hasDisliked,
        likes: result.newLikes,
      });
    },
    onRollback: (targetId) => {
      clearVoteOverride(targetId);
    },
  });

  const mediaItems = useMemo<MediaItem[]>(() => {
    if (!post) return [];
    const resolved = resolvePostContent(post.body, post.media);
    const shouldPreferResolvedMedia =
      (resolved.bodyVideoUrl && resolved.resolvedMedia?.type === "video");
    const list =
      shouldPreferResolvedMedia && resolved.resolvedMedia
        ? [resolved.resolvedMedia]
        : resolved.resolvedMediaList.length > 0
        ? resolved.resolvedMediaList
        : resolved.resolvedMedia
        ? [resolved.resolvedMedia]
        : [];
    return list
      .filter(
        (media) =>
          media.type === "image" ||
          media.type === "video" ||
          media.type === "gif",
      )
      .map((media) => ({
        uri: media.uri,
        type: media.type as MediaItem["type"],
        posterUri: media.posterUri,
        aspectRatio: media.aspectRatio,
      }));
  }, [post]);

  const {
    animatedIndex,
    animatedPosition,
    collapseMedia,
    collapseProgress,
    compactOverlayStyle,
    expandMedia,
    footerInteractive,
    headerH,
    headerStyle,
    inputDockStyle,
    inputDockTotalH,
    listTopY,
    mediaContainerStyle,
    measuredInputDockH,
    measuredPostSummaryH,
    setMeasuredInputDockH,
    setMeasuredPostSummaryH,
    sheetAnimationConfigs,
    sheetRef,
    snapPoints,
  } = useMediaPostDetailLayout({
    insets,
    sourceMediaTransition:
      sourceMediaTransition?.postId === id ? sourceMediaTransition : null,
  });

  const {
    activeIndex,
    activeMedia,
    activeStatus,
    globalMuted,
    handleMuteToggle,
    handlePlayPause,
    handleSeek,
    isVideoActive,
    registerVideo,
    setActiveIndex,
  } = useMediaPostDetailVideoControls(mediaItems);

  const scrollCommentsToIndex = useCallback((index: number, animated = true) => {
    if (index < 0 || index >= displayCommentsLengthRef.current) return false;
    commentsListRef.current?.scrollToIndex?.({
      index,
      animated,
      viewPosition: 0.25,
    });
    return true;
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialHighlightCommentId) {
      setFocusedCommentId(initialHighlightCommentId);
      setFocusedMode("context");
      setHighlightedCommentId(initialHighlightCommentId);
    }
  }, [initialHighlightCommentId]);

  useEffect(() => {
    if (!shouldOpenSheetInitially) return;
    const timer = setTimeout(() => collapseMedia(), 100);
    return () => clearTimeout(timer);
  }, [shouldOpenSheetInitially, collapseMedia]);

  useEffect(() => {
    if (!focusedCommentId || focusedMode === "full" || displayComments.length === 0) return;
    if (focusedInitialScrollTargetRef.current === focusedCommentId) return;
    if (highlightedCommentId && highlightedCommentId !== focusedCommentId) return;
    const containsComment = (comment: Comment): boolean => {
      if (comment.id === focusedCommentId) return true;
      return comment.replies?.some((reply) => containsComment(reply)) ?? false;
    };
    const index = displayComments.findIndex((comment) => {
      return containsComment(comment);
    });
    if (index < 0) return;
    const timer = setTimeout(() => {
      if (index >= displayCommentsLengthRef.current) return;
      focusedInitialScrollTargetRef.current = focusedCommentId;
      scrollCommentsToIndex(index);
    }, 350);
    return () => clearTimeout(timer);
  }, [focusedCommentId, focusedMode, displayComments, highlightedCommentId, scrollCommentsToIndex]);

  const findCommentInTree = useCallback((comment: Comment, targetId: string): boolean => {
    if (comment.id === targetId) return true;
    return comment.replies?.some((reply) => findCommentInTree(reply, targetId)) ?? false;
  }, []);

  useEffect(() => {
    if (!highlightedCommentId || displayComments.length === 0) return;
    if (suppressedHighlightScrollRef.current === highlightedCommentId) return;
    const isPendingOptimisticReply = pendingReplyScrollIdRef.current === highlightedCommentId;
    if (highlightedCommentId.startsWith("optimistic-") && !isPendingOptimisticReply) return;
    const index = displayComments.findIndex((comment) =>
      findCommentInTree(comment, highlightedCommentId),
    );
    if (index < 0) return;
    const coarseTargetKey = `${highlightedCommentId}:${index}`;
    if (coarseScrollTargetRef.current?.startsWith(`${highlightedCommentId}:`)) return;
    const timer = setTimeout(() => {
      if (coarseScrollTargetRef.current?.startsWith(`${highlightedCommentId}:`)) return;
      if (index >= displayCommentsLengthRef.current) return;
      coarseScrollTargetRef.current = coarseTargetKey;
      if (isPendingOptimisticReply) pendingReplyScrollIdRef.current = null;
      scrollCommentsToIndex(index);
    }, 250);
    return () => clearTimeout(timer);
  }, [highlightedCommentId, displayComments, findCommentInTree, scrollCommentsToIndex]);

  const handleHighlightedCommentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!highlightedCommentId) return;
      if (suppressedHighlightScrollRef.current === highlightedCommentId) return;
      if (preciseScrollTargetRef.current?.startsWith(`${highlightedCommentId}:`)) return;
      const target = (event.nativeEvent as { target?: number }).target;
      if (!target) return;
      const scheduledTargetKey = `${highlightedCommentId}:scheduled`;
      preciseScrollTargetRef.current = scheduledTargetKey;

      setTimeout(() => {
        UIManager.measureInWindow(target, (_x, y, _width, height) => {
          if (preciseScrollTargetRef.current !== scheduledTargetKey) return;
          if (height <= 0) {
            preciseScrollTargetRef.current = null;
            return;
          }

          const desiredY = listTopY + 80;
          const delta = y - desiredY;
          if (Math.abs(delta) < 24) {
            preciseScrollTargetRef.current = `${highlightedCommentId}:done`;
            coarseScrollTargetRef.current = `${highlightedCommentId}:precise`;
            return;
          }

          preciseScrollTargetRef.current = `${highlightedCommentId}:done`;
          coarseScrollTargetRef.current = `${highlightedCommentId}:precise`;
          commentsListRef.current?.scrollToOffset?.({
            offset: Math.max(0, commentsScrollYRef.current + delta),
            animated: true,
          });
        });
      }, 500);
    },
    [highlightedCommentId, listTopY],
  );

  const handleAuthorPress = useCallback(() => {
    if (!post) return;
    router.push(`/user/${post.author.id}`);
  }, [post, router]);

  const handleTopicPress = useCallback(() => {
    if (!post?.topic) return;
    router.push(`/topic/${encodeURIComponent(post.topic)}`);
  }, [post, router]);

  const handleUpvote = useCallback(() => {
    if (!post) return;
    postVote.handleUpvote(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes,
    );
  }, [post, postVote]);

  const handleDownvote = useCallback(() => {
    if (!post) return;
    postVote.handleDownvote(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes,
    );
  }, [post, postVote]);

  const handleShare = useCallback(async () => {
    if (!post) return;
    const url = `${getShareBaseUrl(shareServer)}/p/${post.id}`;
    try {
      await Share.share({ message: url, url });
    } catch {}
  }, [post, shareServer]);

  const handleComment = useCallback(() => {
    if (!post) return;
    collapseMedia();
  }, [post, collapseMedia]);

  const revealCommentsAfterPost = useCallback(() => {
    // Only open the comments sheet if it's collapsed onto the post summary
    // (index 0). If the user already had comments visible (index 1 or 2),
    // leave the sheet exactly where it is — snapping would cause the
    // half->full/full->half flash the user complained about.
    if (animatedIndex.value < 0.5) {
      collapseMedia();
    }
    // Mark that we want to scroll to the new comment as soon as it lays out.
    // The effect in `use-media-post-detail-data` watches this ref and the
    // FlatList contents, and runs `scrollToEnd` once the optimistic comment
    // appears in `displayComments`.
    pendingScrollToEndRef.current = true;
  }, [animatedIndex, collapseMedia, pendingScrollToEndRef]);

  const handleEditedComment = useCallback((commentId: string) => {
    suppressedHighlightScrollRef.current = null;
    coarseScrollTargetRef.current = null;
    preciseScrollTargetRef.current = null;
    setHighlightedCommentId(commentId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
  }, []);

  useMediaPostDetailPendingComment({
    collapseMedia,
    revealCommentsAfterPost,
    focusedCommentId,
    focusedMode,
    highlightTimerRef,
    id,
    pendingReplyScrollIdRef,
    pendingScrollToEndRef,
    refetchComments,
    setFocusedMode,
    setHighlightedCommentId,
    suppressedHighlightScrollRef,
  });

  usePostDetailPendingCommentEdit({
    id,
    onEditedComment: handleEditedComment,
    refetchComments,
    setCommentEditOverrides,
  });

  // --- render -------------------------------------------------------------
  if (!post && isLoadingComments) {
    return <MediaPostDetailSkeleton />;
  }

  if (!post) {
    return <MediaPostDetailNotFound onBack={() => router.back()} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Box flex background="base">
          {/* --------------- Media (absolute, below header) ------------ */}
          <MediaPostDetailGallery
            activeIndex={activeIndex}
            activeMedia={activeMedia}
            activeStatus={activeStatus}
            collapseProgress={collapseProgress}
            compactOverlayStyle={compactOverlayStyle}
            expandMedia={expandMedia}
            globalMuted={globalMuted}
            isFocused={isFocused}
            isVideoActive={isVideoActive}
            mediaContainerStyle={mediaContainerStyle}
            mediaItems={mediaItems}
            onMuteToggle={handleMuteToggle}
            onPlayPause={handlePlayPause}
            registerVideo={registerVideo}
            setActiveIndex={setActiveIndex}
            sourceMediaTransition={
              sourceMediaTransition?.postId === id ? sourceMediaTransition : null
            }
            videoSyncScope={videoSyncScope}
            onSwipeUp={collapseMedia}
            onSwipeDown={() => {
              if (collapseProgress.value > 0.1) {
                expandMedia();
              } else {
                router.back();
              }
            }}
          />

          {/* --------------- BottomSheet for comments ------------------ */}
          <MediaPostDetailCommentSheet
            sheetRef={sheetRef}
            commentsListRef={commentsListRef}
            displayComments={displayComments}
            post={post}
            currentUserId={currentUser?.id ?? null}
            followedUsers={followedUsers}
            followedTopics={followedTopics}
            inputDockTotalH={inputDockTotalH}
            shouldOpenSheetInitially={shouldOpenSheetInitially}
            snapPoints={snapPoints}
            animatedIndex={animatedIndex}
            animatedPosition={animatedPosition}
            animationConfigs={sheetAnimationConfigs}
            measuredPostSummaryH={measuredPostSummaryH}
            onPostSummaryHeightChange={setMeasuredPostSummaryH}
            onClose={() => router.back()}
            focusedCommentId={focusedCommentId}
            focusedMode={focusedMode}
            isLoadingComments={isLoadingComments}
            isLoadingFocusedComment={isLoadingFocusedComment}
            isLoadingFocusedContextThread={isLoadingFocusedContextThread}
            recentContextDisabled={recentContextDisabled}
            recentContextDone={recentContextDone}
            hasFullThreadBeyondFocus={hasFullThreadBeyondFocus}
            highlightedCommentId={highlightedCommentId}
            onScrollYChange={(y) => {
              commentsScrollYRef.current = y;
            }}
            onScrollToIndex={scrollCommentsToIndex}
            onAuthorPress={handleAuthorPress}
            onAuthorIdPress={(authorId) => router.push(`/user/${authorId}`)}
            onFollowAuthor={() =>
              followUser(
                post.author.id,
                post.author.username,
                post.isFollowing ?? false,
              )
            }
            onFollowTopic={() => {
              if (post.topic) {
                followTopic(post.topic, followedTopics.includes(post.topic));
              }
            }}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onComment={handleComment}
            onShare={handleShare}
            onBlockUser={() => actionSheetsRef.current?.requestBlockUser()}
            onBlockPost={() => actionSheetsRef.current?.requestBlockPost()}
            onBlockTopic={() => actionSheetsRef.current?.requestBlockTopic()}
            onReportPost={() => actionSheetsRef.current?.requestReportPost()}
            onExpandSheet={collapseMedia}
            isOwnPost={currentUser?.id === post.author.id}
            shareUrl={`${getShareBaseUrl(shareServer)}/p/${post.id}`}
            isVideo={isVideoActive}
            isPlaying={activeStatus.playing}
            positionMs={activeStatus.position}
            durationMs={activeStatus.duration}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            isMuted={globalMuted}
            onMuteToggle={handleMuteToggle}
            onSetFocusedMode={setFocusedMode}
            onRefetchFocusedContext={() => {
              setFocusedContextDepth(10);
            }}
            onCommentUpvote={(cid, l, d, n) =>
              commentVote.handleUpvote(cid, l, d, n)
            }
            onCommentDownvote={(cid, l, d, n) =>
              commentVote.handleDownvote(cid, l, d, n)
            }
            onReplyPress={(c) => {
              requireAuth(() => {
                if (!reserveComposeNavigation()) return;
                router.push({
                  pathname: "/comment-compose",
                  params: {
                    postId: post.id,
                    postTitle: post.title,
                    postAuthorUsername: post.author.username,
                    postContent: post.body ?? "",
                    replyToId: c.id,
                    replyToUsername: c.author.username,
                    replyToContent: c.content,
                  },
                });
              });
            }}
            onMorePress={(c) => {
              actionSheetsRef.current?.presentCommentOptions(c);
            }}
            onHighlightedLayout={handleHighlightedCommentLayout}
          />

          {/* --------------- Header overlay ---------------------------- */}
          <MediaPostDetailHeader
            topic={post.topic}
            paddingTop={insets.top}
            height={headerH}
            animatedStyle={headerStyle}
            pointerEvents="box-none"
            onBack={() => router.back()}
            onTopicPress={handleTopicPress}
            onOptionsPress={() => actionSheetsRef.current?.presentPostOptions()}
          />

          {/* --------------- Comment input dock (collapsed mode) ------ */}
          <Animated.View
            style={[styles.inputDock, inputDockStyle]}
            pointerEvents={footerInteractive ? "none" : "auto"}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (h > 0 && h !== measuredInputDockH) {
                setMeasuredInputDockH(h);
              }
            }}
          >
            <CommentInput
              ref={commentInputRef}
              isLoggedIn={isLoggedIn}
              onAuthRequired={() => requireAuth(() => {})}
              onBeforeOpen={reserveComposeNavigation}
              postId={post.id}
              postTitle={post.title}
              postAuthorUsername={post.author.username}
              postThumbnail={activeMedia?.uri}
              postContent={post.body}
            />
          </Animated.View>

          {/* --------------- Sheets ----------------------------------- */}
          <MediaPostDetailActionSheets
            ref={actionSheetsRef}
            followedTopics={followedTopics}
            followedUsers={followedUsers}
            onBlockCommentAuthor={blockCommentAuthor}
            onRemoveComment={handleRemoveComment}
            post={post}
            reserveComposeNavigation={reserveComposeNavigation}
          />
        </Box>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}
