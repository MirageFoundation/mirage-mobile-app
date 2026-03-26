import {
  useUserFollowed,
  uploadImageAndGetUrl,
} from "@/src/api/read";
import { useComment, useEdit } from "@/src/api/write";
import {
  type Comment,
  CommentInputRef,
  type CommentOptionsSheetRef,
  type Post,
  type PostOptionsSheetRef,
  type ReportSheetRef,
} from "@/src/components/molecules";
import {
  useAuthGuard,
  useBlockHandler,
  useDeleteHandler,
  useFollowHandler,
  useReportHandler,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { useToast } from "@/src/providers/toast-provider";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";
import {
  getShareBaseUrl,
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useUIStore,
} from "@/src/stores";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyEditOverridesToComment,
  applyOptimisticReplies,
  applyVoteOverridesToComment,
  filterComments,
  sortCommentsByCreatedAt,
} from "./post-detail-comment-utils";
import { usePostDetailCommentActions } from "./use-post-detail-comment-actions";
import { usePostDetailHighlightScroll } from "./use-post-detail-highlight-scroll";
import { usePostDetailModeration } from "./use-post-detail-moderation";
import { usePostDetailOverlays } from "./use-post-detail-overlays";
import { usePostDetailPostInteractions } from "./use-post-detail-post-interactions";
import { usePostDetailSync } from "./use-post-detail-sync";

export function usePostDetailScreen() {
  const { id, highlight, reveal, syncContext } = useLocalSearchParams<{
    id: string;
    highlight?: string;
    reveal?: string;
    syncContext?: string;
  }>();
  const router = useRouter();
  const toast = useToast();
  const videoSyncScope = syncContext ?? (id ? `post:${id}` : undefined);

  const { requireAuth, isLoggedIn } = useAuthGuard();
  const currentUser = useAuthStore((s) => s.user);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const shareServer = usePreferencesStore((s) => s.shareServer);

  const optionsSheetRef = useRef<CommentOptionsSheetRef>(null);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const commentInputRef = useRef<CommentInputRef>(null);
  const {
    flatListRef,
    handleScrollToIndexFailed,
    highlightedCommentId,
    scrollToHighlightedComment,
  } = usePostDetailHighlightScroll(highlight);

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );

  const [localPostUpdates, setLocalPostUpdates] = useState<Partial<Post>>({});
  const [localTopicFollowed, setLocalTopicFollowed] = useState<boolean | null>(
    null,
  );
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  const [optimisticReplies, setOptimisticReplies] = useState<
    Record<string, Comment[]>
  >({});

  const {
    isLoadingComments,
    isCommentsError,
    refetchComments,
    isRefetchingComments,
    post,
    comments,
    rootPostData,
    screenActive,
    refetchCommentsRef,
    isMountedRef,
  } = usePostDetailSync({
    id,
    currentUser,
    followedUsers,
    localComments,
    optimisticReplies,
    setLocalComments,
    setOptimisticReplies,
  });

  const { handleFollowUser: handleFollowUserViaQueue, handleFollowTopic: handleFollowTopicViaQueue } = useFollowHandler({
    onOptimisticFollowUser: (_userId, isFollowing) => {
      setLocalPostUpdates((prev) => ({
        ...prev,
        isFollowing,
      }));
    },
    onRollbackFollowUser: () => {
      setLocalPostUpdates((prev) => ({
        ...prev,
        isFollowing: undefined,
      }));
    },
    onOptimisticFollowTopic: (_topic, isFollowing) => {
      setLocalTopicFollowed(isFollowing);
    },
    onRollbackFollowTopic: () => {
      setLocalTopicFollowed(null);
    },
  });

  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const incrementCommentCount = useHomePostCardStore(
    (state) => state.incrementCommentCount,
  );
  const decrementCommentCount = useHomePostCardStore(
    (state) => state.decrementCommentCount,
  );

  const [followLoadingUsers] = useState<Set<string>>(new Set());

  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalUnhidePost = useContentModerationStore((s) => s.unhidePost);
  const globalBlockUser = useContentModerationStore((s) => s.blockUser);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);
  const globalUnhideComment = useContentModerationStore((s) => s.unhideComment);
  const globalHiddenCommentIds = useContentModerationStore(
    (s) => s.hiddenCommentIds,
  );

  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(
    new Set(),
  );
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  const deleteHandler = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") {
        globalUnhidePost(targetId);
      } else {
        globalUnhideComment(targetId);
        setHiddenCommentIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        setLocalPostUpdates((prev) => ({
          ...prev,
          comments: (prev.comments ?? 0) + 1,
        }));
        if (id) incrementCommentCount(id);
      }
    },
  });
  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});

  const removeCommentFromState = useCallback(
    (commentId: string) => {
      const removeComment = (
        targetId: string,
        commentList: Comment[],
      ): Comment[] => {
        return commentList
          .filter((comment) => comment.id !== targetId)
          .map((comment) => ({
            ...comment,
            replies: comment.replies
              ? removeComment(targetId, comment.replies)
              : undefined,
          }));
      };

      setLocalComments((prev) => removeComment(commentId, prev));
      setLocalPostUpdates((prev) => ({
        ...prev,
        comments: Math.max(0, (prev.comments ?? rootPostData?.comments ?? 0) - 1),
      }));
      if (id) decrementCommentCount(id);
    },
    [decrementCommentCount, id, rootPostData?.comments],
  );

  const commentMutation = useComment({});
  const commentMutateAsyncRef = useRef(commentMutation.mutateAsync);
  useEffect(() => {
    commentMutateAsyncRef.current = commentMutation.mutateAsync;
  }, [commentMutation.mutateAsync]);

  const enqueue = usePowQueueStore((state) => state.enqueue);

  const editMutation = useEdit({});
  const editMutateAsyncRef = useRef(editMutation.mutateAsync);
  useEffect(() => {
    editMutateAsyncRef.current = editMutation.mutateAsync;
  }, [editMutation.mutateAsync]);

  const [commentVoteOverrides, setCommentVoteOverrides] = useState<
    Record<
      string,
      { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
    >
  >({});
  const [commentEditOverrides, setCommentEditOverrides] = useState<
    Record<string, string>
  >({});

  const postVoteHandler = useVoteHandler({
    onOptimisticUpdate: useCallback(
      (targetId: string, result: VoteResult) => {
        setVoteOverride(targetId, {
          hasLiked: result.hasLiked,
          hasDisliked: result.hasDisliked,
          likes: result.newLikes,
        });
      },
      [setVoteOverride],
    ),
    onRollback: useCallback(
      (targetId: string) => {
        clearVoteOverride(targetId);
      },
      [clearVoteOverride],
    ),
  });

  const commentVoteHandler = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setCommentVoteOverrides((prev) => {
        const currentDelta = prev[targetId]?.likeDelta ?? 0;
        return {
          ...prev,
          [targetId]: {
            hasLiked: result.hasLiked,
            hasDisliked: result.hasDisliked,
            likeDelta: currentDelta + result.likeDelta,
          },
        };
      });
    }, []),
    onRollback: useCallback((targetId: string) => {
      setCommentVoteOverrides((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }, []),
  });

  const sharedVoteOverride = useHomePostCardStore((state) =>
    id ? state.voteOverrides[id] : undefined,
  );
  const sharedCommentCountOverride = useHomePostCardStore((state) =>
    id ? state.commentCountOverrides[id] : undefined,
  );

  const displayPost = useMemo(() => {
    if (!post) return null;

    let result = { ...post, ...localPostUpdates };

    if (sharedVoteOverride) {
      result = {
        ...result,
        likes: sharedVoteOverride.likes ?? post.likes ?? 0,
        hasLiked: sharedVoteOverride.hasLiked ?? result.hasLiked,
        hasDisliked: sharedVoteOverride.hasDisliked ?? result.hasDisliked,
      };
    }

    if (sharedCommentCountOverride && localPostUpdates.comments === undefined) {
      result = {
        ...result,
        comments:
          (result.comments ?? 0) +
          (sharedCommentCountOverride.commentDelta ?? 0),
      };
    }

    return result;
  }, [localPostUpdates, post, sharedCommentCountOverride, sharedVoteOverride]);

  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);

  const allComments = useMemo(() => {
    const localIds = new Set(localComments.map((comment) => comment.id));
    const dedupedComments = comments.filter((comment) => !localIds.has(comment.id));
    const merged = [...localComments, ...dedupedComments];

    return sortCommentsByCreatedAt(
      filterComments(
        merged
          .map((comment) => applyOptimisticReplies(comment, optimisticReplies))
          .map((comment) =>
            applyVoteOverridesToComment(comment, commentVoteOverrides),
          )
          .map((comment) =>
            applyEditOverridesToComment(comment, commentEditOverrides),
          ),
        hiddenCommentIds,
        globalHiddenCommentIds,
        blockedUserIds,
      ),
    );
  }, [
    blockedUserIds,
    commentEditOverrides,
    commentVoteOverrides,
    comments,
    globalHiddenCommentIds,
    hiddenCommentIds,
    localComments,
    optimisticReplies,
  ]);

  useEffect(() => {
    scrollToHighlightedComment(allComments);
  }, [allComments, scrollToHighlightedComment]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const {
    handleAuthorPress,
    handleDislikePost,
    handleFollowPost,
    handleFollowTopic,
    handleLikePost,
    handleRevealContent,
    handleTopicPress,
    isTopicFollowed,
    postThumbnail,
    revealedContent,
  } = usePostDetailPostInteractions({
    displayPost,
    followedTopics,
    handleFollowTopicViaQueue,
    handleFollowUserViaQueue,
    localPostUpdates,
    localTopicFollowed,
    postVoteHandler,
    revealInitially: reveal === "true",
  });

  const handleLikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number = 0,
    ) => {
      commentVoteHandler.handleUpvote(
        commentId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes,
      );
    },
    [commentVoteHandler],
  );

  const handleDislikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number = 0,
    ) => {
      commentVoteHandler.handleDownvote(
        commentId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes,
      );
    },
    [commentVoteHandler],
  );

  const {
    handleReplyToComment,
    handleCancelReply,
    handleMoreOptions,
    handleEditComment,
    handleEditPost,
    handleAnnotatePost,
  } = usePostDetailCommentActions({
    id,
    currentUser,
    displayPost,
    rootPostData,
    replyingTo,
    requireAuth,
    router,
    commentInputRef,
    optionsSheetRef,
    commentMutateAsyncRef,
    editMutateAsyncRef,
    enqueue,
    generateActionId,
    getActionLabel,
    uploadImageAndGetUrl,
    refetchComments,
    refetchCommentsRef,
    setReplyingTo,
    setSelectedComment,
    setLocalComments,
    setOptimisticReplies,
    setLocalPostUpdates,
    setCommentEditOverrides,
    incrementCommentCount,
    decrementCommentCount,
  });

  const handleFollowCommentAuthor = useCallback(
    (authorId: string, isCurrentlyFollowing: boolean) => {
      handleFollowUserViaQueue(authorId, "", isCurrentlyFollowing);
    },
    [handleFollowUserViaQueue],
  );

  const {
    handleConfirmDelete,
    handleConfirmBlock,
    handleReportSubmitWithOptimistic,
    handleDeleteComment,
    handleDeletePost,
    handleBlockPost,
    handleBlockPostAuthor,
    handleReportPost,
    handleBlockComment,
    handleBlockCommentAuthor,
    handleReportComment,
    handleToggleFollowCommentAuthor,
  } = usePostDetailModeration({
    deleteHandler,
    blockHandler,
    reportHandler,
    reportSheetRef,
    selectedComment,
    displayPost,
    commentsRootUserId: rootPostData?.user_id,
    followedUsers,
    highlight,
    isMountedRef,
    toast,
    router,
    removeCommentFromState,
    globalHidePost,
    globalHideComment,
    globalBlockUser,
    setHiddenCommentIds,
    setBlockedUserIds,
    setSelectedComment,
    onFollowCommentAuthor: handleFollowCommentAuthor,
  });

  const handlePostMorePress = useCallback(() => {
    postOptionsSheetRef.current?.present();
  }, []);

  const {
    awardPickerSheetRef,
    awardTargetId,
    awardTargetIsOwn,
    awardTargetType,
    handleGiveCommentAward,
    handleGivePostAward,
    handleSaveComment,
    handleSavePost,
    isCommentSaved,
    isFollowingCommentAuthor,
    isFollowingPostAuthor,
    isOwnComment,
    isOwnPost,
    isPostSaved,
  } = usePostDetailOverlays({
    currentUserId: currentUser?.id,
    displayPost,
    followedUsers,
    id,
    selectedComment,
  });

  return {
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
    followedTopics,
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
    handleRefreshComments: refetchComments,
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
    shareUrl: `${getShareBaseUrl(shareServer)}/p/${id}`,
    showAuthSheet,
    videoSyncScope,
  };
}
