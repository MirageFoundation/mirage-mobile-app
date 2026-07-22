import { useComments, useUserFollowed } from "@/src/api/read";
import * as Sentry from "@sentry/react-native";
import { parseApiError } from "@/src/utils/parse-api-error";
import { queryKeys } from "@/src/api/read/query-keys";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import type { CommentsResponse } from "@/src/api/types";
import { MediaPostDetailSkeleton } from "@/src/components/molecules";
import { useAuthGuard } from "@/src/hooks";
import {
  useAuthStore,
  useUIStore,
  usePreferencesStore,
} from "@/src/stores";
import { usePendingPostsStore } from "@/src/stores/pending-posts-store";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLastPressedPostY } from "@/src/utils/post-transition";
import { useQueryClient } from "@tanstack/react-query";
import MediaPostDetailScreen from "@/src/pages/post/media-post-detail-screen";
import { PostDetailSections } from "./post-detail-sections";
import { usePostDetailMediaRoute } from "./use-post-detail-media-route";
import { usePostDetailController } from "./use-post-detail-controller";
import { usePostDetailCommentsLifecycle } from "./use-post-detail-comments-lifecycle";
import { usePostDetailFocusedThread } from "./use-post-detail-focused-thread";
import { usePostDetailPostState } from "./use-post-detail-post-state";
import { usePostDetailResolvedPost } from "./use-post-detail-resolved-post";
import { isInboxNotificationNavigationActive } from "@/src/services/inbox-notifications";

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    highlight?: string;
    depth?: string;
    fromNotification?: string;
  }>();

  const {
    isResolvingFocusedMediaRoute,
    routeHighlightCommentId,
    routeRootPostId,
    useImmersive,
  } = usePostDetailMediaRoute(params);

  // Exact in-flight flag only. The previous 10s wall-clock window suppressed
  // legitimate post detail opens that happened shortly after a notification.
  const isNotificationNavigationActive = isInboxNotificationNavigationActive();
  const shouldSuppressStalePostDetail =
    isNotificationNavigationActive && !params.fromNotification;
  const stalePostDetailKey = `${params.id}:${params.highlight ?? ""}`;
  const reportedStalePostDetailRef = useRef<string | null>(null);

  console.log("[InboxNotifFlow] post detail route", {
    id: params.id,
    highlight: params.highlight,
    fromNotification: params.fromNotification,
    isNotificationNavigationActive,
    routeRootPostId,
    routeHighlightCommentId,
    useImmersive,
    isResolvingFocusedMediaRoute,
  });

  useEffect(() => {
    if (!params.fromNotification && !isNotificationNavigationActive) {
      reportedStalePostDetailRef.current = null;
      return;
    }
    Sentry.addBreadcrumb({
      category: "navigation",
      message: "Post detail rendered during notification flow",
      level: "info",
      data: {
        id: params.id,
        highlight: params.highlight,
        fromNotification: params.fromNotification,
        isNotificationNavigationActive,
        routeRootPostId,
        routeHighlightCommentId,
        useImmersive,
        isResolvingFocusedMediaRoute,
      },
    });
    if (
      shouldSuppressStalePostDetail &&
      reportedStalePostDetailRef.current !== stalePostDetailKey
    ) {
      reportedStalePostDetailRef.current = stalePostDetailKey;
      Sentry.captureMessage("Stale post detail suppressed during notification flow", {
        level: "warning",
        tags: {
          feature: "inbox-notifications",
          operation: "stale-post-detail-suppressed",
        },
        extra: {
          id: params.id,
          highlight: params.highlight,
          routeRootPostId,
          routeHighlightCommentId,
          useImmersive,
          isResolvingFocusedMediaRoute,
        },
      });
    }
  }, [
    isNotificationNavigationActive,
    isResolvingFocusedMediaRoute,
    params.fromNotification,
    params.highlight,
    params.id,
    routeHighlightCommentId,
    routeRootPostId,
    shouldSuppressStalePostDetail,
    stalePostDetailKey,
    useImmersive,
  ]);

  if (shouldSuppressStalePostDetail) {
    console.log("[InboxNotifFlow] suppressing stale post detail during notification", {
      id: params.id,
      highlight: params.highlight,
    });
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
  const { requireAuth, isLoggedIn } = useAuthGuard();

  const currentUser = useAuthStore((s) => s.user);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const shareServer = usePreferencesStore((s) => s.apiServer);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (highlight && id) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comments(id, currentUser?.walletAddress ?? undefined),
      });
    }
  }, [currentUser?.walletAddress, highlight, id, queryClient]);

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

  const currentFetchPostNotFound = commentsApiError?.errorCode === "post_not_found" || commentsApiError?.httpStatus === 404;
  const optimisticPost = usePendingPostsStore((state) =>
    id ? state.postsById[id.toLowerCase()] : undefined,
  );
  const [notFoundRouteId, setNotFoundRouteId] = useState<string | null>(null);
  const reportedNotFoundRouteRef = useRef<string | null>(null);
  useEffect(() => {
    setNotFoundRouteId(null);
  }, [id]);
  useEffect(() => {
    if (!id || !currentFetchPostNotFound || optimisticPost) return;
    setNotFoundRouteId(id);
    const reportKey = `${id}:${commentsApiError?.errorCode ?? commentsApiError?.httpStatus ?? "unknown"}`;
    if (reportedNotFoundRouteRef.current === reportKey) return;
    reportedNotFoundRouteRef.current = reportKey;
    Sentry.captureMessage("Post detail route content not found", {
      level: "info",
      tags: {
        feature: "post-detail",
        operation: "route-content-not-found",
        screen: "post-detail",
        error_code: commentsApiError?.errorCode ?? "unknown",
      },
      extra: {
        routePostId: id,
        httpStatus: commentsApiError?.httpStatus,
        hasAddress: !!currentUser?.walletAddress,
        isCommentRoute: !!depth,
      },
    });
  }, [commentsApiError?.errorCode, commentsApiError?.httpStatus, currentFetchPostNotFound, currentUser?.walletAddress, depth, id, optimisticPost]);

  const isPostNotFound = currentFetchPostNotFound || notFoundRouteId === id;
  const shouldUseOptimisticRootFallback = isPostNotFound && !!optimisticPost;
  const effectiveCommentsData = useMemo<CommentsResponse | undefined>(() => {
    if (commentsData) {
      if (!optimisticPost?.optimistic_video_preview_until) return commentsData;
      return {
        ...commentsData,
        root: {
          ...commentsData.root,
          optimistic_status: optimisticPost.optimistic_status,
          optimistic_action_id: optimisticPost.optimistic_action_id,
          optimistic_draft: optimisticPost.optimistic_draft,
          optimistic_video_preview_until: optimisticPost.optimistic_video_preview_until,
        },
      };
    }
    if (!shouldUseOptimisticRootFallback || !optimisticPost) return undefined;
    return {
      root: {
        ...optimisticPost,
        root_post_id: optimisticPost.root_post_id || optimisticPost.post_id,
        children: [],
      },
      children: [],
    };
  }, [commentsData, optimisticPost, shouldUseOptimisticRootFallback]);

  useEffect(() => {
    if (!id || !shouldUseOptimisticRootFallback || !optimisticPost) return;
    Sentry.addBreadcrumb({
      category: "post-detail",
      message: "Using optimistic root post fallback",
      level: "info",
      data: {
        postId: id,
        status: optimisticPost.optimistic_status,
        hasDraft: !!optimisticPost.optimistic_draft,
        mediaCount: optimisticPost.media?.length ?? 0,
      },
    });
  }, [id, optimisticPost, shouldUseOptimisticRootFallback]);

  useEffect(() => {
    usePendingPostsStore.getState().removeExpiredPosts();
  }, []);

  useEffect(() => {
    if (!id || !commentsData?.root) return;
    if (optimisticPost?.optimistic_video_preview_until) return;
    Sentry.addBreadcrumb({
      category: "post-detail",
      message: "Optimistic root post reconciled from detail fetch",
      level: "info",
      data: { postId: id },
    });
    usePendingPostsStore.getState().removePost(id);
  }, [commentsData?.root, id, optimisticPost?.optimistic_video_preview_until]);

  useEffect(() => {
    if (!id || !shouldUseOptimisticRootFallback) return;

    let cancelled = false;
    const retryDelays = [1500, 5000, 15000, 30000];
    const timers = retryDelays.map((delay) =>
      setTimeout(async () => {
        if (cancelled) return;
        try {
          const txStatus = await getTxStatus({ hash: id });
          if (cancelled) return;
          if (txStatus.found && txStatus.code !== undefined && txStatus.code !== 0) {
            Sentry.addBreadcrumb({
              category: "post-detail",
              message: "Optimistic root post transaction rejected",
              level: "warning",
              data: {
                postId: id,
                code: txStatus.code,
                hasErrorDetails: !!txStatus.error_details,
              },
            });
            usePendingPostsStore
              .getState()
              .markPostError(id, txStatus.error_details || "Transaction was rejected by the chain.");
            return;
          }
          const result = await refetchComments();
          if (!cancelled && result.data?.root) {
            Sentry.addBreadcrumb({
              category: "post-detail",
              message: "Optimistic root post fallback reconciled on retry",
              level: "info",
              data: { postId: id, delayMs: delay },
            });
            usePendingPostsStore.getState().removePost(id);
          }
        } catch (error) {
          Sentry.addBreadcrumb({
            category: "post-detail",
            message: "Optimistic root post fallback retry failed",
            level: "warning",
            data: {
              postId: id,
              delayMs: delay,
              error: error instanceof Error ? error.message : String(error),
            },
          });
          // Keep the optimistic detail fallback until the bounded cache expires.
        }
      }, delay),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [id, refetchComments, shouldUseOptimisticRootFallback]);

  const commentsLifecycle = usePostDetailCommentsLifecycle({
    currentUserWallet: currentUser?.walletAddress ?? undefined,
    id,
    isFetchingComments,
    isPostNotFound: isPostNotFound && !shouldUseOptimisticRootFallback,
    queryClient,
    refetchComments,
  });
  const { screenActive } = commentsLifecycle;

  const isViewingComment = useMemo(() => {
    const root = effectiveCommentsData?.root;
    if (!root?.post_id || !root.root_post_id) return false;
    return root.root_post_id.toLowerCase() !== root.post_id.toLowerCase();
  }, [effectiveCommentsData?.root]);

  const focusedThread = usePostDetailFocusedThread({
    commentsData: effectiveCommentsData,
    currentUserWallet: currentUser?.walletAddress ?? undefined,
    depth,
    highlight,
    id,
    isFocused,
    isViewingComment,
    queryClient,
  });
  const {
    actualRootPost,
    actualRootPostId,
  } = focusedThread;

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
  const [followUserOverrides, setFollowUserOverrides] = useState<
    Record<string, boolean>
  >({});
  const displayFollowedUsers = useMemo(() => {
    const overrides = Object.entries(followUserOverrides);
    if (overrides.length === 0) return followedUsers;

    const next = new Set(followedUsers);
    overrides.forEach(([userId, isFollowing]) => {
      if (isFollowing) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
    });
    return Array.from(next);
  }, [followedUsers, followUserOverrides]);

  const { post } = usePostDetailResolvedPost({
    actualRootPost,
    actualRootPostId,
    commentsData: effectiveCommentsData,
    currentUser,
    followedUsers: displayFollowedUsers,
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
    onOptimisticFollowUser: (userId, isFollowing) => {
      setFollowUserOverrides((prev) => ({ ...prev, [userId]: isFollowing }));
    },
    onRollbackFollowUser: (userId) => {
      setFollowUserOverrides((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    },
    post,
  });

  const controller = usePostDetailController({
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
    commentsQuery: {
      isFetching: isFetchingComments,
      isLoading: isLoadingComments,
      refetch: refetchComments,
    },
    insetsTop: insets.top,
    isPostNotFound,
    shouldUseOptimisticRootFallback,
    requireAuth,
    setLocalPostUpdates,
  });

  return (
    <PostDetailSections
      controller={controller}
      id={id}
      highlight={highlight}
      reveal={reveal}
      contentBottomInset={insets.bottom}
      insetsTop={insets.top}
      currentUser={currentUser}
      displayPost={displayPost}
      post={post}
      isViewingComment={isViewingComment}
      effectiveCommentsData={effectiveCommentsData}
      focusedThread={focusedThread}
      followedTopics={followedTopics}
      followedUsers={displayFollowedUsers}
      isCommentsError={isCommentsError}
      isFetchingComments={isFetchingComments}
      isLoadingComments={isLoadingComments}
      isRefetchingComments={isRefetchingComments}
      shouldUseOptimisticRootFallback={shouldUseOptimisticRootFallback}
      screenActive={screenActive}
      shareServer={shareServer}
      videoSyncScope={videoSyncScope}
      postEnteringStyle={postEnteringStyle}
      isLoggedIn={isLoggedIn}
      showAuthSheet={showAuthSheet}
      requireAuth={requireAuth}
      refetchComments={refetchComments}
    />
  );
}
