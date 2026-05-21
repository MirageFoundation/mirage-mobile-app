import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";

import {
  transformApiComment,
  transformApiComments,
  transformApiPost,
  useComments,
  useUserFollowed,
} from "@/src/api/read";
import { getCommentContext } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import type { PostWithChildren } from "@/src/api/types";
import { type Comment, type Post } from "@/src/components/molecules";
import { useVoteHandler } from "@/src/hooks";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  useOptimisticReplyComments,
  useOptimisticTopLevelComments,
  usePostCommentOptimisticStore,
} from "@/src/stores/post-comment-optimistic-store";
import {
  appendSupplementalCommentsForMinimum,
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
  const branchExpansionReportRef = useRef<string | null>(null);
  const {
    data: commentsData,
    isLoading: isLoadingComments,
    refetch: refetchComments,
    isError: isCommentsError,
    error: commentsError,
  } = useComments(id!, { enabled: isFocused });
  const [focusedContextDepth, setFocusedContextDepth] = useState(5);
  const focusedDepth = focusedMode === "context" ? focusedContextDepth : 0;
  const {
    data: focusedCommentData,
    isLoading: isLoadingFocusedComment,
    isFetched: isFocusedCommentFetched,
    isError: isFocusedCommentError,
    error: focusedCommentError,
  } = useComments(focusedCommentId, {
    enabled: isFocused && !!focusedCommentId && focusedMode !== "full",
  });
  const {
    data: focusedContextData,
    refetch: refetchFocusedContext,
    isLoading: isLoadingFocusedContext,
    isError: isFocusedContextError,
    error: focusedContextError,
  } = useQuery({
    queryKey: queryKeys.commentContext(focusedCommentId!, focusedDepth),
    queryFn: () =>
      getCommentContext({
        comment_id: focusedCommentId!,
        address: currentUser?.walletAddress ?? undefined,
        max_depth: focusedDepth,
      }),
    enabled: isFocused && !!focusedCommentId && focusedDepth > 0,
    staleTime: 0,
  });
  const {
    data: focusedContextCheckData,
    isFetched: isFocusedContextCheckFetched,
    isError: isFocusedContextCheckError,
    error: focusedContextCheckError,
  } = useQuery({
    queryKey: queryKeys.commentContext(focusedCommentId!, 10),
    queryFn: () =>
      getCommentContext({
        comment_id: focusedCommentId!,
        address: currentUser?.walletAddress ?? undefined,
        max_depth: 10,
      }),
    enabled: isFocused && !!focusedCommentId && focusedMode !== "full",
    staleTime: 1000 * 60,
  });

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
    if (isFocusedContextError) {
      Sentry.captureException(focusedContextError, {
        tags: { feature: "media-post-detail", operation: "load-focused-context" },
        extra: { postId: id, focusedCommentId, focusedMode, focusedDepth },
      });
    }
    if (isFocusedContextCheckError) {
      Sentry.captureException(focusedContextCheckError, {
        tags: { feature: "media-post-detail", operation: "load-focused-context-check" },
        extra: { postId: id, focusedCommentId, focusedMode },
      });
    }
  }, [
    isCommentsError,
    commentsError,
    isFocusedCommentError,
    focusedCommentError,
    isFocusedContextError,
    focusedContextError,
    isFocusedContextCheckError,
    focusedContextCheckError,
    id,
    focusedCommentId,
    focusedMode,
    focusedDepth,
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

  const basePost: Post | null = useMemo(() => {
    if (!commentsData?.root) return null;
    return transformApiPost(commentsData.root, {
      followedUsers,
      currentUser: currentUser
        ? { id: currentUser.id, username: currentUser.username ?? null }
        : undefined,
    });
  }, [commentsData, followedUsers, currentUser]);

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
    if (!allDisplayComments.some((comment) => comment.id === highlightedCommentId)) return;
    pendingScrollToEndRef.current = false;
    const timer = setTimeout(() => {
      commentsListRef.current?.scrollToEnd?.({ animated: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [allDisplayComments, commentsListRef, focusedCommentId, focusedMode, highlightedCommentId, pendingScrollToEndRef]);

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
    const parentApiComments = (focusedContextData?.context ?? focusedContextCheckData?.context ?? [])
      .filter((comment) => {
        const contextPostId = comment.post_id.toLowerCase();
        return contextPostId !== rootId && contextPostId !== focusedId;
      })
      .reverse();
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
    focusedContextData,
    focusedContextCheckData,
    focusedCommentData,
    focusedContextDepth,
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
    if (isLoadingFocusedContextThread) return [];
    const focused = focusedThreadState.focused;
    if (!focused) return [];
    const expandedFocusedBranch = focusedContextDepth > 5
      ? findTopLevelBranchForComment(allDisplayComments, focusedCommentId)
      : null;
    if (expandedFocusedBranch && focusedMode === "context") {
      return [expandedFocusedBranch];
    }
    if (focusedMode !== "context" || focusedThreadState.parents.length === 0) {
      return appendSupplementalCommentsForMinimum([focused], allDisplayComments);
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
    return appendSupplementalCommentsForMinimum(
      [{ ...thread, isFocusedContext: true }],
      allDisplayComments,
    );
  }, [focusedCommentId, focusedMode, allDisplayComments, isLoadingFocusedContextThread, focusedThreadState, focusedContextDepth]);

  displayCommentsLengthRef.current = displayComments.length;

  useEffect(() => {
    if (!id || !commentsData?.children) return;
    if (focusedCommentId && focusedMode !== "full") return;
    pruneCommentsPresentOnServer(id, comments);
  }, [id, commentsData?.children, comments, focusedCommentId, focusedMode, pruneCommentsPresentOnServer]);

  const availableFocusedContextCount = useMemo(() => {
    if (!focusedCommentId) return 0;
    const rootId = id?.toLowerCase();
    const focusedId = focusedCommentId.toLowerCase();
    return (focusedContextCheckData?.context ?? []).filter((comment) => {
      const contextPostId = comment.post_id.toLowerCase();
      return contextPostId !== rootId && contextPostId !== focusedId;
    }).length;
  }, [focusedCommentId, focusedContextCheckData, id]);

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

  const hasRecentContext = useMemo(() => {
    if (!focusedCommentId || focusedMode === "full") return false;
    if (!isFocusedCommentFetched || !isFocusedContextCheckFetched) return false;
    return hasFocusedBranchReplies ||
      (availableFocusedContextCount > 0 &&
        (focusedMode !== "context" || focusedContextDepth < availableFocusedContextCount));
  }, [focusedCommentId, focusedMode, isFocusedCommentFetched, isFocusedContextCheckFetched, hasFocusedBranchReplies, availableFocusedContextCount, focusedContextDepth]);

  const recentContextDone =
    !hasFocusedBranchReplies &&
    focusedMode === "context" &&
    isFocusedCommentFetched &&
    isFocusedContextCheckFetched &&
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
