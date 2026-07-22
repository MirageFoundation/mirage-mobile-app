import { useInfiniteUserPosts, useProfile, useUserStatus } from "@/src/api/read";
import { getUserPosts } from "@/src/api/read/endpoints/posts";
import {
  USER_POSTS_MAX_PAGES,
  USER_POSTS_QUERY_GC_TIME,
} from "@/src/api/read/infinite-query-policy";
import { queryKeys } from "@/src/api/read/query-keys";
import { transformApiPost } from "@/src/api/read/utils";
import type { PostsResponse } from "@/src/api/types";
import { useEdit } from "@/src/api/write";
import { getGradientColor, PROFILE_CONTENT_HEIGHT } from "@/src/components/molecules";
import { useTabSwipeGesture, useVoteHandler, type VoteResult } from "@/src/hooks";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";
import { useRouter } from "@/src/navigation/guarded-router";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { generateActionId, getActionLabel, usePowQueueStore } from "@/src/services/pow-queue";
import {
  useAuthStore,
  useContentModerationStore,
  useFeedScrollStore,
  usePreferencesStore,
} from "@/src/stores";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { composeCommentContent, resolveCommentMediaUrl } from "@/src/utils/comment-media";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList } from "react-native";
import {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ProfilePostActionSheetsRef } from "./profile-post-action-sheets";
import {
  calculateAccountAgeDays,
  formatMirageBalance,
  getOwnProfileActionRoute,
  getOwnProfilePostType,
  selectOwnProfileListData,
  type OwnProfileListItem,
} from "./profile-state";
import { useProfileFeedVideoState } from "./use-profile-feed-video-state";

const HEADER_BAR_HEIGHT = 56;
export const PROFILE_POSTS_FEED_CONTEXT = "profile:self:posts";

export function useProfileController(headerInset: number, windowHeight: number) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const { registerProfileRefresh, showBars } = useScrollAnimationContext();
  const user = useAuthStore((state) => state.user);
  const storedUserLevel = useAuthStore((state) => state.userLevel);
  const setUserLevel = useAuthStore((state) => state.setUserLevel);
  const shareServer = usePreferencesStore((state) => state.apiServer);
  const hiddenPostIds = useContentModerationStore((state) => state.hiddenPostIds);
  const hiddenCommentIds = useContentModerationStore((state) => state.hiddenCommentIds);
  const postEditOverrides = usePostEditStore((state) => state.overrides);
  const pendingEdit = useCommentComposeStore((state) => state.pendingEdit);
  const clearPendingEdit = useCommentComposeStore((state) => state.clearPendingEdit);
  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const enqueue = usePowQueueStore((state) => state.enqueue);
  const walletAddress = user?.walletAddress ?? null;

  const flatListRef = useRef<FlatList<OwnProfileListItem>>(null);
  const postActionSheetsRef = useRef<ProfilePostActionSheetsRef>(null);
  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);
  const [activeTab, setActiveTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTabsSticky, setIsTabsSticky] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const [commentEditOverrides, setCommentEditOverrides] = useState<Record<string, string>>({});
  const scrollY = useSharedValue(0);
  const animatedTabIndex = useSharedValue(0);

  const {
    data: userStatus,
    isLoading: isLoadingStatus,
    refetch: refetchUserStatus,
  } = useUserStatus();
  const {
    data: profile,
    isLoading: isLoadingProfile,
    refetch: refetchProfile,
  } = useProfile();
  const postType = getOwnProfilePostType(activeTab);
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingPosts,
    refetch: refetchPosts,
  } = useInfiniteUserPosts(walletAddress, { type: postType, limit: 20 });

  const userPostsRefreshParams = useMemo(() => walletAddress ? ({
    owner: walletAddress,
    address: walletAddress,
    type: postType,
    limit: 20,
  }) : undefined, [postType, walletAddress]);
  usePostDataRefresher({ userPostsParams: userPostsRefreshParams });

  useEffect(() => {
    if (!walletAddress) return;
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.userPosts(walletAddress, "comments", undefined, walletAddress),
      queryFn: ({ pageParam = 1 }) => getUserPosts({
        owner: walletAddress,
        address: walletAddress,
        page: pageParam,
        type: "comments",
        limit: 20,
      }),
      initialPageParam: 1,
      getNextPageParam: (lastPage: PostsResponse) =>
        lastPage?.has_more ? lastPage.page + 1 : undefined,
      maxPages: USER_POSTS_MAX_PAGES,
      gcTime: USER_POSTS_QUERY_GC_TIME,
    });
  }, [queryClient, walletAddress]);

  const apiPosts = useMemo(() => {
    const posts = postsData?.pages.flatMap((page) => page.posts) ?? [];
    if (postType === "submissions") {
      return posts
        .filter((post) => !hiddenPostIds.has(post.post_id))
        .map((post) => {
          const override = postEditOverrides[post.post_id];
          return override ? {
            ...post,
            title: override.title,
            content: override.content,
            topic: override.topic ?? post.topic,
            media: override.media ?? post.media,
          } : post;
        });
    }
    return posts
      .filter((post) => !hiddenCommentIds.has(post.post_id))
      .map((post) => {
        const content = commentEditOverrides[post.post_id];
        return content === undefined ? post : { ...post, content };
      });
  }, [commentEditOverrides, hiddenCommentIds, hiddenPostIds, postEditOverrides, postType, postsData]);
  const uiPosts = useMemo(() => apiPosts.map((post) => transformApiPost(post, {
    currentUser: user ? { id: user.id, username: user.username } : undefined,
  })), [apiPosts, user]);
  const listData = useMemo(
    () => selectOwnProfileListData(activeTab, uiPosts, apiPosts),
    [activeTab, apiPosts, uiPosts],
  );
  const postsById = useMemo(() => new Map(uiPosts.map((post) => [post.id, post])), [uiPosts]);
  const postsWithoutWarnings = useMemo(() => new Map(
    uiPosts.map((post) => [post.id, { ...post, contentWarnings: undefined }]),
  ), [uiPosts]);

  const username = userStatus?.username ?? user?.username ?? "user";
  const avatarUrl = profile?.avatar || undefined;
  const gradientColors = useMemo(() => getGradientColor(username), [username]);
  const isLoading = isLoadingStatus || isLoadingProfile;
  const headerHeight = headerInset + HEADER_BAR_HEIGHT;
  const stickyThreshold = PROFILE_CONTENT_HEIGHT;
  const minimumContentHeight = windowHeight + stickyThreshold + 1;
  const profileData = useMemo(() => ({
    balance: formatMirageBalance(userStatus?.balance ?? 0),
    reserve: formatMirageBalance(userStatus?.reserve_funds ?? 0),
    accountAgeDays: calculateAccountAgeDays(
      profile?.created_at ?? userStatus?.profile_registered_at,
    ),
  }), [profile, userStatus]);

  const setFeedScrolling = useCallback((scrolling: boolean) => {
    useFeedScrollStore.getState().setContextScrolling(PROFILE_POSTS_FEED_CONTEXT, scrolling);
  }, []);
  const invalidateWalletQueries = useCallback(async (
    address: string,
    session = authSessionCoordinator.current(),
  ) => {
    if (!authSessionCoordinator.matches(session, address)) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.userPostsForOwner(address) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.userBlocked(address) }),
    ]);
  }, [queryClient]);
  const refreshProfile = useCallback(async (scrollToTop: boolean) => {
    const address = walletAddress;
    const session = authSessionCoordinator.current();
    if (scrollToTop) flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setIsRefreshing(true);
    try {
      await Promise.all([refetchUserStatus(), refetchProfile(), refetchPosts()]);
      if (address) await invalidateWalletQueries(address, session);
    } finally {
      setIsRefreshing(false);
    }
  }, [invalidateWalletQueries, refetchPosts, refetchProfile, refetchUserStatus, walletAddress]);
  useEffect(() => {
    registerProfileRefresh(() => refreshProfile(true));
  }, [refreshProfile, registerProfileRefresh]);
  useFocusEffect(useCallback(() => {
    showBars();
    setFocusVersion((version) => version + 1);
    if (!walletAddress) return;
    const session = authSessionCoordinator.current();
    void Promise.all([refetchUserStatus(), refetchProfile()]).then(() => {
      void invalidateWalletQueries(walletAddress, session);
    });
  }, [invalidateWalletQueries, refetchProfile, refetchUserStatus, showBars, walletAddress]));

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setVoteOverride(targetId, {
        hasLiked: result.hasLiked,
        hasDisliked: result.hasDisliked,
        likes: result.newLikes,
      });
    }, [setVoteOverride]),
    onRollback: useCallback((targetId: string) => clearVoteOverride(targetId), [clearVoteOverride]),
  });
  const editMutation = useEdit({});
  const editMutateAsyncRef = useRef(editMutation.mutateAsync);
  useEffect(() => {
    editMutateAsyncRef.current = editMutation.mutateAsync;
  }, [editMutation.mutateAsync]);
  useEffect(() => {
    if (!pendingEdit || pendingEdit.source !== "profile") return;
    const { commentId, parentId, text, imageUri, gifUrl } = pendingEdit;
    const address = walletAddress;
    const session = authSessionCoordinator.current();
    clearPendingEdit();
    if (!commentId || commentId.startsWith("optimistic-") || !address) return;
    const optimisticContent = composeCommentContent(text, imageUri || gifUrl || null);
    setCommentEditOverrides((previous) => ({ ...previous, [commentId]: optimisticContent }));
    enqueue({
      id: generateActionId(),
      type: "edit",
      label: getActionLabel("edit"),
      execute: async () => {
        const mediaUrl = await resolveCommentMediaUrl(imageUri, gifUrl);
        return editMutateAsyncRef.current({
          postId: commentId,
          parentId,
          title: "",
          content: composeCommentContent(text, mediaUrl),
          tag: "",
        });
      },
      onSuccess: () => {
        setTimeout(async () => {
          if (!authSessionCoordinator.matches(session, address)) return;
          await refetchPosts();
          setCommentEditOverrides((previous) => {
            const next = { ...previous };
            delete next[commentId];
            return next;
          });
        }, 3000);
      },
      onError: (error) => {
        Sentry.captureException(error, {
          tags: { feature: "comment", operation: "edit_comment_profile" },
          extra: {
            commentId,
            parentId,
            hadImage: !!imageUri,
            hadGif: !!gifUrl,
            contentLength: text.length,
          },
        });
        if (!authSessionCoordinator.matches(session, address)) return;
        setCommentEditOverrides((previous) => {
          const next = { ...previous };
          delete next[commentId];
          return next;
        });
      },
    });
  }, [clearPendingEdit, enqueue, pendingEdit, refetchPosts, walletAddress]);

  const handleBackPress = useCallback(() => router.back(), [router]);
  const handleEditUsernamePress = useCallback(() => {
    const currentUserLevel = userStatus?.user_level ?? 0;
    if (
      walletAddress &&
      currentUserLevel > storedUserLevel &&
      authSessionCoordinator.matches(authSessionCoordinator.current(), walletAddress)
    ) {
      setUserLevel(currentUserLevel, walletAddress);
    }
    router.push(getOwnProfileActionRoute("edit-username")!);
  }, [router, setUserLevel, storedUserLevel, userStatus?.user_level, walletAddress]);
  const handleFollowersPress = useCallback(() => {
    const route = getOwnProfileActionRoute("followers", walletAddress || user?.username);
    if (route) router.push(route);
  }, [router, user?.username, walletAddress]);
  const handleSettingsPress = useCallback(
    () => router.push(getOwnProfileActionRoute("settings")!),
    [router],
  );
  const handleBlockedPress = useCallback(
    () => router.push(getOwnProfileActionRoute("blocked")!),
    [router],
  );
  const handlePostPress = useCallback((postId: string) => router.push(`/post/${postId}`), [router]);
  const handleAuthorPress = useCallback((authorId: string) => router.push(`/user/${authorId}`), [router]);
  const handleTopicPress = useCallback(
    (topic: string) => router.push(`/topic/${encodeURIComponent(topic)}`),
    [router],
  );
  const handleCommentPress = useCallback((commentId: string, rootPostId: string) => {
    if (!rootPostId || rootPostId === "undefined") {
      console.warn("Cannot navigate: missing root post ID for comment", commentId);
      return;
    }
    router.push(`/post/${rootPostId}?highlight=${commentId}`);
  }, [router]);
  const handlePostMorePress = useCallback((postId: string) => {
    const post = postsById.get(postId);
    if (post) postActionSheetsRef.current?.openPost(post);
  }, [postsById]);

  const handleSwipeTabChange = useCallback((index: number) => {
    setActiveTab(index);
    showBars();
  }, [showBars]);
  const { swipeGesture, contentAnimatedStyle, fadeOpacity, completeTransition } =
    useTabSwipeGesture({ onTabChange: handleSwipeTabChange, animatedIndex: animatedTabIndex });
  const handleTabChange = useCallback((index: number) => {
    if (index === activeTab) return;
    showBars();
    animatedTabIndex.value = withTiming(index, { duration: 200 });
    fadeOpacity.value = withTiming(0, { duration: 100 }, (finished) => {
      "worklet";
      if (finished) runOnJS(completeTransition)(index);
    });
  }, [activeTab, animatedTabIndex, completeTransition, fadeOpacity, showBars]);
  const handleTabDoubleTap = useCallback(async (_index: number) => {
    await refreshProfile(true);
  }, [refreshProfile]);

  const {
    activeVideoPostId,
    visibleVideoPostIds,
    nearbyVideoPostIds,
    profileViewabilityConfig,
    onProfileViewableItemsChanged,
    handleProfileMomentumScrollEnd,
  } = useProfileFeedVideoState({ activeTab, listData });
  const handleEndReached = useCallback(() => {
    if (activeTab === 2) return;
    const now = Date.now();
    if (hasNextPage && !isFetchingNextPage && !isFetchingRef.current && now - lastFetchTime.current > 1000) {
      lastFetchTime.current = now;
      isFetchingRef.current = true;
      fetchNextPage().finally(() => { isFetchingRef.current = false; });
    }
  }, [activeTab, fetchNextPage, hasNextPage, isFetchingNextPage]);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => { scrollY.value = event.contentOffset.y; },
  });
  const stickyTabsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrollY.value >= stickyThreshold ? 1 : 0,
  }));
  useAnimatedReaction(
    () => scrollY.value >= stickyThreshold,
    (next, previous) => {
      if (next !== previous) runOnJS(setIsTabsSticky)(next);
    },
    [stickyThreshold],
  );
  useEffect(() => () => setFeedScrolling(false), [setFeedScrolling]);

  return {
    activeTab, activeVideoPostId, animatedTabIndex, avatarUrl, contentAnimatedStyle,
    flatListRef, focusVersion, gradientColors, handleAuthorPress, handleBackPress,
    handleBlockedPress, handleCommentPress, handleDownvote, handleEditUsernamePress,
    handleEndReached, handleFollowersPress, handlePostMorePress, handlePostPress,
    handleProfileMomentumScrollEnd, handleSettingsPress, handleTabChange,
    handleTabDoubleTap, handleTopicPress, handleUpvote, headerHeight, isFetchingNextPage,
    isFocused, isLoading, isLoadingPosts, isRefreshing, isTabsSticky, listData,
    minimumContentHeight, nearbyVideoPostIds, onProfileViewableItemsChanged,
    postActionSheetsRef, postsWithoutWarnings, profileData, profileViewabilityConfig,
    scrollHandler, scrollY, setFeedScrolling, shareServer, stickyTabsAnimatedStyle,
    swipeGesture, userStatus, username, visibleVideoPostIds, walletAddress,
  };
}

export type ProfileController = ReturnType<typeof useProfileController>;
