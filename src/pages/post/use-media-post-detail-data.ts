import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";

import {
  transformApiComment,
  transformApiComments,
  transformApiPost,
  useComments,
  useUserFollowed,
} from "@/src/api/read";
import { readThreadAncestors } from "@/src/api/read/thread-ancestors";
import type { PostWithChildren } from "@/src/api/types";
import { type Comment, type Post } from "@/src/components/molecules";
import { useVoteHandler } from "@/src/hooks";
import { parseApiError } from "@/src/utils/parse-api-error";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePendingPostsStore } from "@/src/stores/pending-posts-store";
import {
  useOptimisticReplyComments,
  useOptimisticTopLevelComments,
  usePostCommentOptimisticStore,
} from "@/src/stores/post-comment-optimistic-store";
import { findPostInCachedData } from "./post-detail-media-routing";
import {
  applyEditOverridesToComment,
  countCommentsInTree,
  findCommentById,
  findTopLevelBranchForComment,
  hasMoreRepliesInBranch,
} from "./post-detail-comment-utils";

type FocusedMode = "single" | "context" | "full";

type CurrentUser = {
  id: string;
  username?: string | null;
  walletAddress?: string | null;
};

type ScrollableCommentsRef = {
  scrollToEnd?: (options?: { animated?: boolean }) => void;
};

type CachedPostRecord = Post | PostWithChildren | Record<string, unknown>;

function isUiPost(post: CachedPostRecord): post is Post {
  return !!(
    post &&
    typeof post === "object" &&
    typeof (post as Post).id === "string" &&
    (post as Post).author &&
    typeof (post as Post).author === "object"
  );
}

function isApiPost(post: CachedPostRecord): post is PostWithChildren {
  return !!(
    post &&
    typeof post === "object" &&
    typeof (post as PostWithChildren).post_id === "string" &&
    typeof (post as PostWithChildren).user_id === "string"
  );
}

type UseMediaPostDetailDataOptions = {
  commentsListRef: RefObject<ScrollableCommentsRef | null>;
  currentUser: CurrentUser | null | undefined;
  displayCommentsLengthRef: RefObject<number>;
  focusedCommentId: string | null;
  focusedMode: FocusedMode;
  highlightedCommentId: string | null;
  id: string | undefined;
  isFocused: boolean;
  pendingScrollToEndRef: RefObject<boolean>;
};

export function useMediaPostDetailData({
  commentsListRef,
  currentUser,
  displayCommentsLengthRef,
  focusedCommentId,
  focusedMode,
  highlightedCommentId,
  id,
  isFocused,
  pendingScrollToEndRef,
}: UseMediaPostDetailDataOptions) {
  const queryClient = useQueryClient();
  const branchExpansionReportRef = useRef<string | null>(null);
  const {
    data: commentsData,
    isLoading: isLoadingComments,
    refetch: refetchComments,
    isError: isCommentsError,
    error: commentsError,
  } = useComments(id!, { enabled: isFocused });
  const commentsApiError = useMemo(() => {
    if (!commentsError) return null;
    return parseApiError(commentsError);
  }, [commentsError]);
  const currentFetchPostNotFound = commentsApiError?.errorCode === "post_not_found" || commentsApiError?.httpStatus === 404;
  const [notFoundRouteId, setNotFoundRouteId] = useState<string | null>(null);
  const reportedNotFoundRouteRef = useRef<string | null>(null);
  useEffect(() => {
    setNotFoundRouteId(null);
  }, [id]);
  useEffect(() => {
    if (!id || !currentFetchPostNotFound) return;
    setNotFoundRouteId(id);
    const reportKey = `${id}:${commentsApiError?.errorCode ?? commentsApiError?.httpStatus ?? "unknown"}`;
    if (reportedNotFoundRouteRef.current === reportKey) return;
    reportedNotFoundRouteRef.current = reportKey;
    Sentry.captureMessage("Media post detail route content not found", {
      level: "info",
      tags: {
        feature: "post-detail",
        operation: "route-content-not-found",
        screen: "media-post-detail",
        error_code: commentsApiError?.errorCode ?? "unknown",
      },
      extra: {
        routePostId: id,
        httpStatus: commentsApiError?.httpStatus,
        hasAddress: !!currentUser?.walletAddress,
        focusedCommentId,
        focusedMode,
      },
    });
  }, [commentsApiError?.errorCode, commentsApiError?.httpStatus, currentFetchPostNotFound, currentUser?.walletAddress, focusedCommentId, focusedMode, id]);
  const isPostNotFound = currentFetchPostNotFound || notFoundRouteId === id;
  const [focusedContextDepth, setFocusedContextDepth] = useState(5);
  const {
    data: focusedCommentData,
    isLoading: isLoadingFocusedComment,
    isFetched: isFocusedCommentFetched,
    isError: isFocusedCommentError,
    error: focusedCommentError,
  } = useComments(focusedCommentId, {
    enabled: isFocused && !!focusedCommentId && focusedMode !== "full",
  });
  const focusedCommentApiError = useMemo(() => {
    if (!focusedCommentError) return null;
    return parseApiError(focusedCommentError);
  }, [focusedCommentError]);
  const currentFocusedCommentNotFound = !!focusedCommentId && focusedMode !== "full" && (
    focusedCommentApiError?.errorCode === "post_not_found" ||
    focusedCommentApiError?.errorCode === "comment_not_found" ||
    focusedCommentApiError?.httpStatus === 404
  );
  const [notFoundFocusedCommentId, setNotFoundFocusedCommentId] = useState<string | null>(null);
  const reportedFocusedCommentNotFoundRef = useRef<string | null>(null);
  useEffect(() => {
    setNotFoundFocusedCommentId(null);
  }, [focusedCommentId]);
  useEffect(() => {
    if (!focusedCommentId || !currentFocusedCommentNotFound) return;
    setNotFoundFocusedCommentId(focusedCommentId);
    const reportKey = `${id ?? "missing"}:${focusedCommentId}:${focusedCommentApiError?.errorCode ?? focusedCommentApiError?.httpStatus ?? "unknown"}`;
    if (reportedFocusedCommentNotFoundRef.current === reportKey) return;
    reportedFocusedCommentNotFoundRef.current = reportKey;
    Sentry.captureMessage("Media post detail focused comment not found", {
      level: "info",
      tags: {
        feature: "comments",
        operation: "focused-comment-not-found",
        screen: "media-post-detail",
        error_code: focusedCommentApiError?.errorCode ?? "unknown",
      },
      extra: {
        rootPostId: id,
        focusedCommentId,
        focusedMode,
        httpStatus: focusedCommentApiError?.httpStatus,
        hasAddress: !!currentUser?.walletAddress,
        hasRootData: !!commentsData?.root,
      },
    });
  }, [commentsData?.root, currentFocusedCommentNotFound, currentUser?.walletAddress, focusedCommentApiError?.errorCode, focusedCommentApiError?.httpStatus, focusedCommentId, focusedMode, id]);
  const isFocusedCommentNotFound = !!focusedCommentId && (
    currentFocusedCommentNotFound || notFoundFocusedCommentId === focusedCommentId
  );
  // B-2.6: the focused comment response already carries its ancestor chain
  // (root post first), enriched with votes/awards/media by the node. There is
  // no separate context request and nothing to page in.
  const focusedThread = readThreadAncestors(focusedCommentData);
  const isLoadingFocusedContext = !!focusedCommentId && !focusedThread.resolved;
  const refetchFocusedContext = useCallback(() => {}, []);

  useEffect(() => {
    setFocusedContextDepth(5);
    branchExpansionReportRef.current = null;
  }, [focusedCommentId]);

  useEffect(() => {
    if (isCommentsError) {
      Sentry.captureException(commentsError, {
        tags: { feature: "media-post-detail", operation: "load-comments" },
        extra: { postId: id, focusedCommentId, focusedMode },
      });
    }
    if (isFocusedCommentError) {
      Sentry.captureException(focusedCommentError, {
        tags: { feature: "media-post-detail", operation: "load-focused-comment" },
        extra: { postId: id, focusedCommentId, focusedMode },
      });
    }
  }, [
    isCommentsError,
    commentsError,
    isFocusedCommentError,
    focusedCommentError,
    id,
    focusedCommentId,
    focusedMode,
  ]);

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );
  const optimisticPost = usePendingPostsStore((state) =>
    id ? state.postsById[id.toLowerCase()] : undefined,
  );

  const cachedPost = useMemo<Post | null>(() => {
    if (!id || isPostNotFound) return null;

    const cachedQueries = queryClient.getQueriesData({});
    for (const [, queryData] of cachedQueries) {
      const matched = findPostInCachedData(queryData, id) as CachedPostRecord | null;
      if (!matched) continue;
      if (isUiPost(matched)) return matched;
      if (isApiPost(matched)) {
        return transformApiPost(matched, {
          followedUsers,
          currentUser: currentUser
            ? { id: currentUser.id, username: currentUser.username ?? null }
            : undefined,
        });
      }
    }
    return null;
  }, [currentUser, followedUsers, id, isPostNotFound, queryClient]);

  const basePost: Post | null = useMemo(() => {
    if (isPostNotFound) return null;
    const serverPost = commentsData?.root
      ? transformApiPost(commentsData.root, {
      followedUsers,
      currentUser: currentUser
        ? { id: currentUser.id, username: currentUser.username ?? null }
        : undefined,
      })
      : cachedPost;
    if (!serverPost || !optimisticPost) return serverPost;
    return {
      ...serverPost,
      optimisticStatus: optimisticPost.optimistic_status,
      optimisticError: optimisticPost.optimistic_error,
      optimisticActionId: optimisticPost.optimistic_action_id,
      optimisticDraft: optimisticPost.optimistic_draft,
      optimisticVideoPreviewUntil: optimisticPost.optimistic_video_preview_until,
    };
  }, [cachedPost, commentsData, followedUsers, currentUser, isPostNotFound, optimisticPost]);

  const sharedVoteOverride = useHomePostCardStore((state) =>
    id ? state.voteOverrides[id] : undefined,
  );
  const post: Post | null = useMemo(() => {
    if (!basePost) return null;
    if (!sharedVoteOverride) return basePost;
    return {
      ...basePost,
      likes: sharedVoteOverride.likes ?? basePost.likes ?? 0,
      hasLiked: sharedVoteOverride.hasLiked ?? basePost.hasLiked,
      hasDisliked: sharedVoteOverride.hasDisliked ?? basePost.hasDisliked,
    };
  }, [basePost, sharedVoteOverride]);

  const comments = useMemo<Comment[]>(() => {
    if (!commentsData?.children) return [];
    return transformApiComments(commentsData.children);
  }, [commentsData]);
  const optimisticTopLevelComments = useOptimisticTopLevelComments(id);
  const optimisticReplyComments = useOptimisticReplyComments(id);
  const removeOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.removeComment,
  );
  const pruneCommentsPresentOnServer = usePostCommentOptimisticStore(
    (state) => state.pruneCommentsPresentOnServer,
  );
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(
    new Set(),
  );
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [commentVoteOverrides, setCommentVoteOverrides] = useState<
    Record<
      string,
      { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
    >
  >({});
  const [commentEditOverrides, setCommentEditOverrides] = useState<Record<string, string>>({});
  const commentVote = useVoteHandler({
    onOptimisticUpdate: (targetId, result) => {
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
    },
    onRollback: (targetId) => {
      setCommentVoteOverrides((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    },
  });

  const applyVoteOverridesToComment = useCallback(
    (comment: Comment): Comment => {
      const override = commentVoteOverrides[comment.id];
      const updated: Comment = override
        ? {
            ...comment,
            likes: comment.likes + (override.likeDelta ?? 0),
            hasLiked: override.hasLiked ?? comment.hasLiked,
            hasDisliked: override.hasDisliked ?? comment.hasDisliked,
          }
        : comment;
      if (updated.replies && updated.replies.length > 0) {
        return {
          ...updated,
          replies: updated.replies.map(applyVoteOverridesToComment),
        };
      }
      return updated;
    },
    [commentVoteOverrides],
  );

  const applyOptimisticReplies = useCallback(
    (comment: Comment): Comment => {
      const pendingReplies = optimisticReplyComments[comment.id] ?? [];
      const existingReplies = comment.replies ?? [];
      const processedReplies = existingReplies.map(applyOptimisticReplies);
      const existingIds = new Set(existingReplies.map((reply) => reply.id));
      const dedupedPending = pendingReplies.filter((reply) => !existingIds.has(reply.id));
      const allReplies = [...processedReplies, ...dedupedPending];
      return {
        ...comment,
        replies: allReplies.length > 0 ? allReplies : comment.replies,
        replyCount: (comment.replyCount ?? 0) + dedupedPending.length,
      };
    },
    [optimisticReplyComments],
  );

  const allDisplayComments = useMemo(() => {
    const localIds = new Set(optimisticTopLevelComments.map((comment) => comment.id));
    const deduped = comments.filter((comment) => !localIds.has(comment.id));
    return [...optimisticTopLevelComments, ...deduped]
      .map(applyOptimisticReplies)
      .map(applyVoteOverridesToComment)
      .map((comment) => applyEditOverridesToComment(comment, commentEditOverrides))
      .filter(
        (comment) =>
          !hiddenCommentIds.has(comment.id) && !blockedUserIds.has(comment.author.id),
      )
      .sort((a, b) => {
        const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt);
        const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt);
        return timeA - timeB;
      });
  }, [
    optimisticTopLevelComments,
    comments,
    applyOptimisticReplies,
    applyVoteOverridesToComment,
    commentEditOverrides,
    hiddenCommentIds,
    blockedUserIds,
  ]);

  useEffect(() => {
    if (!pendingScrollToEndRef.current) return;
    if (focusedCommentId && focusedMode !== "full") return;
    if (!highlightedCommentId) return;
    const containsHighlighted = (comment: Comment): boolean => {
      if (comment.id === highlightedCommentId) return true;
      return comment.replies?.some(containsHighlighted) ?? false;
    };
    if (!allDisplayComments.some(containsHighlighted)) {
      // Safety net: if the highlighted comment hasn't shown up within a
      // few seconds we'll never scroll to it. Surface that so we can
      // diagnose missed optimistic insertions / id swaps in Sentry.
      const missingTimer = setTimeout(() => {
        if (!pendingScrollToEndRef.current) return;
        Sentry.captureMessage(
          "Pending scroll-to-comment never resolved on media post detail",
          {
            level: "warning",
            tags: { feature: "media-post-detail", operation: "scroll-after-post" },
            extra: {
              postId: id,
              highlightedCommentId,
              topLevelCount: allDisplayComments.length,
              focusedCommentId,
              focusedMode,
            },
          },
        );
        pendingScrollToEndRef.current = false;
      }, 4000);
      return () => clearTimeout(missingTimer);
    }
    pendingScrollToEndRef.current = false;
    Sentry.addBreadcrumb({
      category: "media-post-detail",
      message: "Scrolling to newly posted comment",
      level: "info",
      data: {
        postId: id,
        highlightedCommentId,
        topLevelCount: allDisplayComments.length,
      },
    });
    requestAnimationFrame(() => {
      commentsListRef.current?.scrollToEnd?.({ animated: true });
    });
    const timer = setTimeout(() => {
      commentsListRef.current?.scrollToEnd?.({ animated: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [allDisplayComments, commentsListRef, focusedCommentId, focusedMode, highlightedCommentId, id, pendingScrollToEndRef]);

  const focusedThreadState = useMemo(() => {
    const isVisible = (comment: Comment) =>
      !hiddenCommentIds.has(comment.id) && !blockedUserIds.has(comment.author.id);
    const findComment = (items: Comment[]): Comment | null => {
      if (!focusedCommentId) return null;
      for (const item of items) {
        if (item.id === focusedCommentId) return item;
        const nested = item.replies?.length ? findComment(item.replies) : null;
        if (nested) return nested;
      }
      return null;
    };
    const processFocused = (comment: Comment) =>
      applyVoteOverridesToComment(applyOptimisticReplies(comment));

    if (!focusedCommentId) {
      return { focused: null as Comment | null, parents: [] as Comment[], hasParent: false, hasReplies: false };
    }

    const focusedFromApi = focusedCommentData?.root
      ? {
          ...transformApiComment(focusedCommentData.root, id ?? null, 0),
          replies: transformApiComments(focusedCommentData.children ?? []),
          replyCount: Math.max(
            focusedCommentData.root.comments ?? 0,
            focusedCommentData.children?.length ?? 0,
          ),
        }
      : null;
    const focusedFromFullBranch = focusedContextDepth > 5
      ? findCommentById(allDisplayComments, focusedCommentId)
      : null;
    const focused = focusedFromApi
      ? processFocused({
          ...focusedFromApi,
          replies: focusedFromFullBranch?.replies ?? focusedFromApi.replies,
          replyCount: Math.max(
            focusedFromApi.replyCount ?? 0,
            focusedFromFullBranch?.replyCount ?? 0,
          ),
        })
      : findComment(allDisplayComments);

    const rootId = id?.toLowerCase();
    const focusedId = focusedCommentId.toLowerCase();
    // `parentChain` is already root-first and already excludes both the root
    // post and the focused comment; only guard against the route id itself.
    const parentApiComments = focusedThread.parentChain.filter((comment) => {
      const contextPostId = comment.post_id.toLowerCase();
      return contextPostId !== rootId && contextPostId !== focusedId;
    });
    const parents = parentApiComments
      .map((comment, index) =>
        processFocused(
          transformApiComment(
            comment as PostWithChildren,
            index === 0 ? id ?? null : parentApiComments[index - 1]?.post_id ?? null,
            index,
          ),
        ),
      )
      .filter(isVisible);

    const hasReplies = !!focused &&
      ((focused.replies?.length ?? 0) > 0 ||
        (focused.replyCount ?? 0) > 0 ||
        (focusedCommentData?.children?.length ?? 0) > 0 ||
        (focusedCommentData?.root?.comments ?? 0) > 0);

    return {
      focused: focused && isVisible(focused) ? focused : null,
      parents,
      hasParent: parents.length > 0,
      hasReplies,
    };
  }, [
    focusedCommentId,
    allDisplayComments,
    focusedCommentData,
    focusedContextDepth,
    focusedThread.parentChain,
    id,
    applyOptimisticReplies,
    applyVoteOverridesToComment,
    hiddenCommentIds,
    blockedUserIds,
  ]);

  const isLoadingFocusedContextThread = !!(
    focusedCommentId &&
    focusedMode === "context" &&
    (!isFocusedCommentFetched || isLoadingFocusedContext)
  );

  const displayComments = useMemo(() => {
    if (!focusedCommentId || focusedMode === "full") return allDisplayComments;
    // Render the focused comment as soon as it is available, even while
    // ancestor context is still loading; loaded ancestors wrap around it once
    // they arrive instead of blanking the list. Unrelated comments are never
    // padded in — the "Full thread" affordance covers that.
    const focused = focusedThreadState.focused;
    if (!focused) return [];
    const expandedFocusedBranch = focusedMode === "context"
      ? findTopLevelBranchForComment(allDisplayComments, focusedCommentId)
      : null;
    if (expandedFocusedBranch && focusedMode === "context") {
      return [expandedFocusedBranch];
    }
    if (focusedMode !== "context" || focusedThreadState.parents.length === 0) {
      return [focused];
    }
    let thread: Comment = focused;
    for (let index = focusedThreadState.parents.length - 1; index >= 0; index -= 1) {
      const parent = focusedThreadState.parents[index];
      const optimisticParentReplies = (parent.replies ?? []).filter(
        (reply) => reply.id !== thread.id,
      );
      thread = {
        ...parent,
        isFocusedContext: true,
        replies: [...optimisticParentReplies, thread],
        replyCount: Math.max(parent.replyCount ?? 0, optimisticParentReplies.length + 1),
      };
    }
    return [{ ...thread, isFocusedContext: true }];
  }, [focusedCommentId, focusedMode, allDisplayComments, focusedThreadState]);

  displayCommentsLengthRef.current = displayComments.length;

  useEffect(() => {
    if (!id || !commentsData?.children) return;
    if (focusedCommentId && focusedMode !== "full") return;
    pruneCommentsPresentOnServer(id, comments);
  }, [id, commentsData?.children, comments, focusedCommentId, focusedMode, pruneCommentsPresentOnServer]);

  const availableFocusedContextCount = useMemo(() => {
    if (!focusedCommentId) return 0;
    // What we hold, plus what the node told us it elided.
    return focusedThread.parentChain.length + focusedThread.omitted;
  }, [focusedCommentId, focusedThread.omitted, focusedThread.parentChain]);

  const hasFocusedBranchReplies = useMemo(
    () => hasMoreRepliesInBranch(displayComments, allDisplayComments, focusedCommentId),
    [displayComments, allDisplayComments, focusedCommentId],
  );

  useEffect(() => {
    if (!focusedCommentId || focusedMode !== "context" || focusedContextDepth <= 5) return;
    const reportKey = `${id ?? "missing"}:${focusedCommentId}:${focusedContextDepth}`;
    if (branchExpansionReportRef.current === reportKey) return;
    const branch = findTopLevelBranchForComment(allDisplayComments, focusedCommentId);
    branchExpansionReportRef.current = reportKey;
    if (branch) {
      Sentry.addBreadcrumb({
        category: "comments",
        message: "Expanded focused media comment branch",
        data: {
          postId: id,
          focusedCommentId,
          branchId: branch.id,
          branchCommentCount: countCommentsInTree([branch]),
          screen: "media-post-detail",
        },
        level: "info",
      });
      return;
    }

    Sentry.captureMessage("Focused media branch expansion requested but branch was not found", {
      level: "warning",
      tags: { feature: "comments", operation: "focused-media-branch-expand" },
      extra: {
        postId: id,
        focusedCommentId,
        fullBranchRootCount: allDisplayComments.length,
        screen: "media-post-detail",
      },
    });
  }, [focusedCommentId, focusedMode, focusedContextDepth, allDisplayComments, id]);

  // The ancestor picture is settled the moment the thread response lands.
  const isFocusedContextSettled = focusedThread.resolved;

  const hasRecentContext = useMemo(() => {
    if (!focusedCommentId || focusedMode === "full") return false;
    if (!isFocusedCommentFetched || !isFocusedContextSettled) return false;
    return hasFocusedBranchReplies ||
      (availableFocusedContextCount > 0 &&
        (focusedMode !== "context" || focusedContextDepth < availableFocusedContextCount));
  }, [focusedCommentId, focusedMode, isFocusedCommentFetched, isFocusedContextSettled, hasFocusedBranchReplies, availableFocusedContextCount, focusedContextDepth]);

  const recentContextDone =
    !hasFocusedBranchReplies &&
    focusedMode === "context" &&
    isFocusedCommentFetched &&
    isFocusedContextSettled &&
    availableFocusedContextCount > 0 &&
    focusedContextDepth >= availableFocusedContextCount;
  const recentContextDisabled = !hasRecentContext || recentContextDone;

  const hasFullThreadBeyondFocus = useMemo(() => {
    if (!focusedCommentId || focusedMode === "full") return false;
    const countTree = (items: Comment[]): number =>
      items.reduce((total, item) => total + 1 + countTree(item.replies ?? []), 0);
    const fullCount = Math.max(post?.comments ?? 0, countTree(allDisplayComments));
    const focusedCount = countTree(displayComments);
    return fullCount > focusedCount;
  }, [focusedCommentId, focusedMode, post?.comments, allDisplayComments, displayComments]);

  const removeCommentFromState = useCallback(
    (commentId: string) => {
      if (id) removeOptimisticComment(id, commentId);
      setHiddenCommentIds((prev) => new Set(prev).add(commentId));
    },
    [id, removeOptimisticComment],
  );

  const blockCommentAuthor = useCallback((authorId: string) => {
    setBlockedUserIds((prev) => new Set(prev).add(authorId));
  }, []);

  return {
    blockCommentAuthor,
    commentVote,
    displayComments,
    focusedThreadState,
    followedTopics,
    followedUsers,
    hasFullThreadBeyondFocus,
    isLoadingComments,
    isLoadingFocusedComment,
    isLoadingFocusedContextThread,
    isFocusedCommentNotFound,
    isPostNotFound,
    post,
    recentContextDisabled,
    recentContextDone,
    refetchComments,
    refetchFocusedContext,
    setCommentEditOverrides,
    setFocusedContextDepth,
    removeCommentFromState,
  };
}
