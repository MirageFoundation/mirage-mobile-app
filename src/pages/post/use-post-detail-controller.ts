import { transformApiComments, type useComments } from "@/src/api/read";
import type { CommentsResponse } from "@/src/api/types";
import type { Comment, Post } from "@/src/components/molecules";
import type { useAuthGuard } from "@/src/hooks";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "@/src/navigation/guarded-router";
import {
  POST_DETAIL_HOME_ROUTE,
  resolvePostDetailExitAction,
} from "@/src/navigation/post-detail-route-policy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useContentModerationStore } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  useOptimisticReplyComments,
  useOptimisticTopLevelComments,
  usePostCommentOptimisticStore,
} from "@/src/stores/post-comment-optimistic-store";
import {
  buildPostDetailComments,
  countCommentsInTree,
  findTopLevelBranchForComment,
  hasMoreRepliesInBranch,
  mergePostDetailComments,
} from "./post-detail-comment-utils";
import type { PostDetailActionSheetsRef } from "./post-detail-action-sheets";
import type { PostDetailCommentComposerRef } from "./post-detail-comment-composer";
import type { PostDetailCommentsSectionRef } from "./post-detail-comments-section";
import {
  applyPostDetailCommentCountDelta,
  getFocusedContextState,
  getPostDetailAvailability,
} from "./post-detail-controller";
import { usePostDetailCommentVoting } from "./use-post-detail-comment-voting";
import type { usePostDetailCommentsLifecycle } from "./use-post-detail-comments-lifecycle";
import type { usePostDetailFocusedThread } from "./use-post-detail-focused-thread";
import { usePostDetailHighlightScroll } from "./use-post-detail-highlight-scroll";
import { usePostDetailPendingCommentEdit } from "./use-post-detail-pending-comment-edit";
import { usePostDetailStickyHeader } from "./use-post-detail-sticky-header";

type FocusedThread = ReturnType<typeof usePostDetailFocusedThread>;
type CommentsLifecycle = ReturnType<typeof usePostDetailCommentsLifecycle>;
type CommentsQuery = ReturnType<typeof useComments>;
type AuthGuard = ReturnType<typeof useAuthGuard>;

type UsePostDetailControllerOptions = {
  id: string;
  highlight?: string;
  depth?: string;
  effectiveCommentsData?: CommentsResponse;
  actualRootPost: CommentsResponse["root"] | null;
  displayPost: Post | null;
  post: Post | null;
  isViewingComment: boolean;
  handleFollowCommentAuthor: (authorId: string, isCurrentlyFollowing: boolean) => void;
  focusedThread: FocusedThread;
  commentsLifecycle: CommentsLifecycle;
  commentsQuery: Pick<
    CommentsQuery,
    "isFetching" | "isLoading" | "refetch"
  >;
  insetsTop: number;
  isPostNotFound: boolean;
  shouldUseOptimisticRootFallback: boolean;
  requireAuth: AuthGuard["requireAuth"];
  setLocalPostUpdates: React.Dispatch<React.SetStateAction<Partial<Post>>>;
};

export function usePostDetailController({
  id,
  highlight,
  depth,
  effectiveCommentsData,
  actualRootPost,
  displayPost,
  post,
  isViewingComment,
  handleFollowCommentAuthor,
  focusedThread,
  commentsLifecycle,
  commentsQuery,
  insetsTop,
  isPostNotFound,
  shouldUseOptimisticRootFallback,
  requireAuth,
  setLocalPostUpdates,
}: UsePostDetailControllerOptions) {
  const router = useRouter();
  const actionSheetsRef = useRef<PostDetailActionSheetsRef>(null);
  const commentComposerRef = useRef<PostDetailCommentComposerRef>(null);
  const commentsSectionRef = useRef<PostDetailCommentsSectionRef>(null);
  const [followLoadingUsers] = useState<Set<string>>(() => new Set());
  const [commentEditOverrides, setCommentEditOverrides] = useState<Record<string, string>>({});
  const [revealFocusedBranch, setRevealFocusedBranch] = useState(false);
  const branchExpansionReportRef = useRef<string | null>(null);
  const hasInitialCommentsLoaded = useRef(false);

  const globalHiddenCommentIds = useContentModerationStore((state) => state.hiddenCommentIds);
  const globalBlockedUserIds = useContentModerationStore((state) => state.blockedUserIds);
  const incrementCommentCount = useHomePostCardStore((state) => state.incrementCommentCount);
  const decrementCommentCount = useHomePostCardStore((state) => state.decrementCommentCount);
  const optimisticTopLevelComments = useOptimisticTopLevelComments(focusedThread.optimisticThreadId);
  const optimisticReplyComments = useOptimisticReplyComments(focusedThread.optimisticThreadId);
  const addTopLevelOptimisticComment = usePostCommentOptimisticStore((state) => state.addTopLevelComment);
  const addReplyOptimisticComment = usePostCommentOptimisticStore((state) => state.addReplyComment);
  const replaceOptimisticCommentId = usePostCommentOptimisticStore((state) => state.replaceCommentId);
  const removeOptimisticComment = usePostCommentOptimisticStore((state) => state.removeComment);
  const pruneCommentsPresentOnServer = usePostCommentOptimisticStore(
    (state) => state.pruneCommentsPresentOnServer,
  );

  useEffect(() => {
    setRevealFocusedBranch(false);
    branchExpansionReportRef.current = null;
  }, [id, focusedThread.focusedCommentId]);

  const comments = useMemo(
    () =>
      buildPostDetailComments({
        actualRootPostId: focusedThread.actualRootPostId,
        commentsData: effectiveCommentsData,
        contextComments: focusedThread.contextComments,
        focusedCommentData: focusedThread.focusedCommentData,
        focusedCommentId: focusedThread.focusedCommentId,
        fullThreadCommentsData: focusedThread.fullThreadCommentsData,
        isViewingComment,
        showFocusedThread: focusedThread.showFocusedThread,
      }),
    [effectiveCommentsData, focusedThread, isViewingComment],
  );

  // Derived inside the thread hook, from the ancestor chain the thread
  // response carries.
  const availableFocusedContextCount = focusedThread.focusedContextAvailableCount;

  const loadedFocusedContextCount = useMemo(() => {
    if (!focusedThread.focusedCommentId) return 0;
    const rootId = focusedThread.actualRootPostId?.toLowerCase();
    const focusedId = focusedThread.focusedCommentId.toLowerCase();
    return focusedThread.contextComments.filter((comment) => {
      const contextPostId = comment.post_id.toLowerCase();
      return contextPostId !== rootId && contextPostId !== focusedId;
    }).length;
  }, [focusedThread]);

  const hasFullThreadBeyondFocus = useMemo(() => {
    if (!focusedThread.focusedCommentId) return false;
    return Math.max(post?.comments ?? 0, actualRootPost?.comments ?? 0) > countCommentsInTree(comments);
  }, [actualRootPost?.comments, comments, focusedThread.focusedCommentId, post?.comments]);

  useEffect(() => {
    if (!id || !effectiveCommentsData?.children) return;
    if (focusedThread.focusedCommentId && focusedThread.showFocusedThread) return;
    if (!hasInitialCommentsLoaded.current) {
      hasInitialCommentsLoaded.current = true;
      return;
    }
    pruneCommentsPresentOnServer(focusedThread.optimisticThreadId, comments);
  }, [comments, effectiveCommentsData?.children, focusedThread.focusedCommentId, focusedThread.optimisticThreadId, focusedThread.showFocusedThread, id, pruneCommentsPresentOnServer]);

  const commentVoting = usePostDetailCommentVoting();
  const allComments = useMemo(
    () =>
      mergePostDetailComments({
        blockedUserIds: globalBlockedUserIds,
        commentEditOverrides,
        commentVoteOverrides: commentVoting.commentVoteOverrides,
        comments,
        globalHiddenCommentIds,
        hiddenCommentIds: globalHiddenCommentIds,
        optimisticReplyComments,
        optimisticTopLevelComments,
      }),
    [commentEditOverrides, commentVoting.commentVoteOverrides, comments, globalBlockedUserIds, globalHiddenCommentIds, optimisticReplyComments, optimisticTopLevelComments],
  );

  const fullBranchComments = useMemo(() => {
    const source = isViewingComment
      ? focusedThread.fullThreadCommentsData?.children
      : effectiveCommentsData?.children;
    return transformApiComments(source ?? []);
  }, [effectiveCommentsData?.children, focusedThread.fullThreadCommentsData?.children, isViewingComment]);
  const hasFocusedBranchReplies = useMemo(
    () => hasMoreRepliesInBranch(comments, fullBranchComments, focusedThread.focusedCommentId),
    [comments, focusedThread.focusedCommentId, fullBranchComments],
  );

  useEffect(() => {
    if (!revealFocusedBranch || !focusedThread.focusedCommentId || fullBranchComments.length === 0) return;
    const reportKey = `${id}:${focusedThread.focusedCommentId}`;
    if (branchExpansionReportRef.current === reportKey) return;
    const branch = findTopLevelBranchForComment(fullBranchComments, focusedThread.focusedCommentId);
    branchExpansionReportRef.current = reportKey;
    if (branch) {
      Sentry.addBreadcrumb({
        category: "comments",
        message: "Expanded focused comment branch",
        data: { postId: id, focusedCommentId: focusedThread.focusedCommentId, branchId: branch.id, branchCommentCount: countCommentsInTree([branch]), screen: "post-detail" },
        level: "info",
      });
      return;
    }
    Sentry.captureMessage("Focused branch expansion requested but branch was not found", {
      level: "warning",
      tags: { feature: "comments", operation: "focused-branch-expand" },
      extra: { postId: id, focusedCommentId: focusedThread.focusedCommentId, rootPostId: focusedThread.actualRootPostId, fullBranchRootCount: fullBranchComments.length, screen: "post-detail" },
    });
  }, [focusedThread.actualRootPostId, focusedThread.focusedCommentId, fullBranchComments, id, revealFocusedBranch]);

  const focusedContext = getFocusedContextState({
    availableAncestorCount: availableFocusedContextCount,
    loadedAncestorCount: loadedFocusedContextCount,
    hasBranchReplies: hasFocusedBranchReplies,
    hasLoadedFocusedContext: focusedThread.hasLoadedFocusedContext,
    isContextCheckFetched: focusedThread.isFocusedContextSettled,
    contextDepth: focusedThread.contextDepth,
  });
  const highlightScroll = usePostDetailHighlightScroll({
    allComments,
    commentsSectionRef,
    contextDepth: focusedThread.contextDepth,
    focusedCommentId: focusedThread.focusedCommentId,
    highlight,
    id,
    insetsTop,
    isFetchingComments: commentsQuery.isFetching,
    isLoadingComments: commentsQuery.isLoading,
    isLoadingContext: focusedThread.isLoadingContext,
    lastCommentsFetchRef: commentsLifecycle.lastCommentsFetchRef,
    refetchCommentsRef: commentsLifecycle.refetchCommentsRef,
  });
  const stickyHeader = usePostDetailStickyHeader({ currentScrollYRef: highlightScroll.currentScrollYRef });

  const handleBack = useCallback(() => {
    if (resolvePostDetailExitAction(router.canGoBack()) === "back") router.back();
    else router.replace(POST_DETAIL_HOME_ROUTE);
  }, [router]);
  const handleUnavailableBack = useCallback(() => router.replace(POST_DETAIL_HOME_ROUTE), [router]);
  const handleReplyToComment = useCallback((comment: Comment) => {
    commentComposerRef.current?.startReply(comment);
  }, []);
  const handleMoreOptions = useCallback((comment: Comment) => {
    requireAuth(() => actionSheetsRef.current?.presentCommentOptions(comment));
  }, [requireAuth]);

  usePostDetailPendingCommentEdit({
    id,
    onEditedComment: highlightScroll.handleComposerHighlight,
    refetchComments: commentsQuery.refetch,
    setCommentEditOverrides,
  });

  const availability = getPostDetailAvailability({
    isPostNotFound,
    isFocusedCommentNotFound: focusedThread.isFocusedCommentNotFound,
    isCommentRoute: !!depth,
    shouldUseOptimisticRootFallback,
  });
  const { handleComposerConfirmedCommentId } = highlightScroll;
  const handleConfirmedCommentId = useCallback((optimisticId: string, confirmedId: string) => {
    handleComposerConfirmedCommentId(optimisticId, confirmedId);
    actionSheetsRef.current?.replaceSelectedCommentId(optimisticId, confirmedId);
  }, [handleComposerConfirmedCommentId]);
  const handleCommentCountDelta = useCallback((delta: number, fallbackBase: number) => {
    setLocalPostUpdates((current) => applyPostDetailCommentCountDelta(current, delta, fallbackBase));
  }, [setLocalPostUpdates]);

  return {
    refs: { actionSheetsRef, commentComposerRef, commentsSectionRef },
    availability,
    navigation: {
      back: handleBack,
      unavailableBack: handleUnavailableBack,
      authorPress: (authorId: string) => router.push(`/user/${authorId}`),
      topicPress: displayPost?.topic ? () => router.push(`/topic/${encodeURIComponent(displayPost.topic!)}`) : undefined,
    },
    thread: {
      allComments,
      followLoadingUsers,
      hasFullThreadBeyondFocus,
      ...focusedContext,
      revealFocusedBranch,
      // The whole ancestor chain ships with the thread response, so "show more
      // context" is now a pure reveal — nothing left to fetch.
      loadFocusedContext: async () => {
        setRevealFocusedBranch(true);
      },
      showFullThread: () => {
        highlightScroll.suppressHighlightAutoScroll();
        // Clearing the focus derives an empty context chain on the next render.
        focusedThread.setShowFocusedThread(false);
      },
      followCommentAuthor: handleFollowCommentAuthor,
      replyToComment: handleReplyToComment,
      moreOptions: handleMoreOptions,
      ...commentVoting,
    },
    scroll: { ...highlightScroll, ...stickyHeader },
    composer: {
      addReplyOptimisticComment,
      addTopLevelOptimisticComment,
      decrementCommentCount,
      incrementCommentCount,
      removeOptimisticComment,
      replaceOptimisticCommentId,
      handleCommentCountDelta,
      handleConfirmedCommentId,
      refetchAfterSuccess: () => commentsLifecycle.refetchCommentsRef.current?.(true),
    },
  };
}

export type PostDetailController = ReturnType<typeof usePostDetailController>;
