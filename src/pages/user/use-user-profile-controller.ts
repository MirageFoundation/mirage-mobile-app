import { getUserPosts } from "@/src/api/read/endpoints/posts";
import {
  USER_POSTS_MAX_PAGES,
  USER_POSTS_QUERY_GC_TIME,
} from "@/src/api/read/infinite-query-policy";
import { queryKeys } from "@/src/api/read/query-keys";
import { transformApiPost } from "@/src/api/read/utils";
import {
  useAddressFromUsername,
  useInfiniteUserPosts,
  useProfileByAddress,
  useUserBlocked,
  useUserFollowed,
  useUserStatusByAddress,
} from "@/src/api/read";
import type { PostsResponse } from "@/src/api/types";
import { useBlockUser, useUnblockUser } from "@/src/api/write";
import type {
  GiftMirageSheetRef,
  GiftSubscriptionSheetRef,
  ReportSheetRef,
} from "@/src/components/molecules";
import {
  getGradientColor,
  PROFILE_CONTENT_HEIGHT,
} from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  useAuthGuard,
  useFollowHandler,
  useTabSwipeGesture,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";
import { useRouter } from "@/src/navigation/guarded-router";
import { useProfileFeedVideoState } from "@/src/pages/profile/use-profile-feed-video-state";
import type { ProfilePostActionSheetsRef } from "@/src/pages/profile/profile-post-action-sheets";
import { useToast } from "@/src/providers/toast-provider";
import { markSeen } from "@/src/services/seen-posts";
import {
  getShareBaseUrl,
  useAuthStore,
  useContentModerationStore,
  useFeedScrollStore,
  usePreferencesStore,
  useTimeTickStore,
} from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import * as Sentry from "@sentry/react-native";
import { useIsFocused } from "expo-router/react-navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Share } from "react-native";
import {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { UserProfileMenuSheetRef } from "./user-profile-menu-sheet";
import {
  calculateAccountAgeDays,
  formatMirageBalance,
  getUserProfilePostType,
  resolveOptimisticMembership,
  resolveUserProfileAddress,
  selectUserProfileListData,
  type UserProfileListItem,
} from "./user-profile-state";

const PROFILE_HEADER_BAR_HEIGHT = 56;

export function useUserProfileController(
  headerInset: number,
  windowHeight: number,
) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { requireAuth } = useAuthGuard();
  const currentUser = useAuthStore((state) => state.user);
  const shareServer = usePreferencesStore((state) => state.apiServer);
  const hiddenPostIds = useContentModerationStore((state) => state.hiddenPostIds);
  const hiddenCommentIds = useContentModerationStore((state) => state.hiddenCommentIds);
  const postEditOverrides = usePostEditStore((state) => state.overrides);
  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);

  const flatListRef = useRef<FlatList<UserProfileListItem>>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const postActionSheetsRef = useRef<ProfilePostActionSheetsRef>(null);
  const userMenuSheetRef = useRef<UserProfileMenuSheetRef>(null);
  const giftMirageSheetRef = useRef<GiftMirageSheetRef>(null);
  const giftSubscriptionSheetRef = useRef<GiftSubscriptionSheetRef>(null);
  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);

  const [activeTab, setActiveTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTabsSticky, setIsTabsSticky] = useState(false);
  const [showBlockUserConfirmation, setShowBlockUserConfirmation] = useState(false);
  const [isBlockingUser, setIsBlockingUser] = useState(false);
  const [optimisticBlocked, setOptimisticBlocked] = useState<boolean | null>(null);
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());
  const scrollY = useSharedValue(0);
  const hasUserScrolled = useSharedValue(false);
  const animatedTabIndex = useSharedValue(0);

  const isUsername = Boolean(id && !id.startsWith("mirage"));
  const { data: resolvedAddress, isLoading: isResolvingUsername } =
    useAddressFromUsername(isUsername ? id : null);
  const userAddress = resolveUserProfileAddress(id, resolvedAddress?.address);
  const {
    data: userStatus,
    isLoading: isLoadingStatus,
    refetch: refetchUserStatus,
  } = useUserStatusByAddress(userAddress);
  const {
    data: profile,
    isLoading: isLoadingProfile,
    refetch: refetchProfile,
  } = useProfileByAddress(userAddress);
  const { data: followedData } = useUserFollowed();
  const { data: blockedData } = useUserBlocked();
  const blockUserMutation = useBlockUser();
  const unblockUserMutation = useUnblockUser();

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
  const { handleFollowUser } = useFollowHandler({
    onOptimisticFollowUser: useCallback((_userId: string, following: boolean) => {
      setOptimisticFollowing(following);
    }, []),
    onRollbackFollowUser: useCallback(() => setOptimisticFollowing(null), []),
  });

  const isFollowing = resolveOptimisticMembership(
    userAddress,
    followedData?.followed_users,
    optimisticFollowing,
  );
  const isBlocked = resolveOptimisticMembership(
    userAddress,
    blockedData?.blocked_users,
    optimisticBlocked,
  );
  const postType = getUserProfilePostType(activeTab);
  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingPosts,
    refetch: refetchPosts,
  } = useInfiniteUserPosts(userAddress, { type: postType, limit: 20 });

  const userPostsRefreshParams = useMemo(() => userAddress ? ({
    owner: userAddress,
    address: currentUser?.walletAddress ?? undefined,
    type: postType,
    limit: 20,
  }) : undefined, [currentUser?.walletAddress, postType, userAddress]);
  usePostDataRefresher({ userPostsParams: userPostsRefreshParams });

  useEffect(() => {
    if (!userAddress) return;
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.userPosts(
        userAddress,
        currentUser?.walletAddress,
        { type: "comments", limit: 20 },
      ),
      queryFn: ({ pageParam = 1 }) => getUserPosts({
        owner: userAddress,
        address: currentUser?.walletAddress ?? undefined,
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
  }, [currentUser?.walletAddress, queryClient, userAddress]);

  const apiPosts = useMemo(() => {
    const posts = postsData?.pages.flatMap((page) => page.posts) ?? [];
    if (postType === "comments") {
      return posts.filter((post) => !hiddenCommentIds.has(post.post_id));
    }
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
  }, [hiddenCommentIds, hiddenPostIds, postEditOverrides, postType, postsData]);
  const uiPosts = useMemo(() => apiPosts.map((post) => transformApiPost(post, {
    currentUser: currentUser ? { id: currentUser.id, username: currentUser.username } : undefined,
  })), [apiPosts, currentUser]);
  const listData = useMemo(
    () => selectUserProfileListData(activeTab, isBlocked, uiPosts, apiPosts),
    [activeTab, apiPosts, isBlocked, uiPosts],
  );
  const postsById = useMemo(() => new Map(uiPosts.map((post) => [post.id, post])), [uiPosts]);

  const displayUsername = userStatus?.username ?? profile?.username;
  const username = displayUsername ?? "user";
  const avatarUrl = profile?.avatar || undefined;
  const gradientColors = useMemo(() => getGradientColor(username), [username]);
  const isLoading = isResolvingUsername || isLoadingStatus || isLoadingProfile;
  const isOwnProfile = currentUser?.walletAddress === userAddress;
  const headerHeight = headerInset + PROFILE_HEADER_BAR_HEIGHT;
  const stickyThreshold = PROFILE_CONTENT_HEIGHT;
  const minimumContentHeight = windowHeight + stickyThreshold + 1;
  useTimeTickStore((state) => state.tick);
  const profileData = {
    balance: formatMirageBalance(userStatus?.balance ?? 0),
    reserve: formatMirageBalance(userStatus?.reserve_funds ?? 0),
    accountAgeDays: calculateAccountAgeDays(
      profile?.created_at ?? userStatus?.profile_registered_at,
    ),
  };
  const userProfileFeedContext = useMemo(() => `profile:user:${id}:posts`, [id]);
  const setFeedScrolling = useCallback((scrolling: boolean) => {
    useFeedScrollStore.getState().setContextScrolling(userProfileFeedContext, scrolling);
  }, [userProfileFeedContext]);

  const handleSwipeTabChange = useCallback((index: number) => setActiveTab(index), []);
  const { swipeGesture, contentAnimatedStyle, fadeOpacity, completeTransition } =
    useTabSwipeGesture({ onTabChange: handleSwipeTabChange, animatedIndex: animatedTabIndex });
  const handleTabChange = useCallback((index: number) => {
    if (index === activeTab) return;
    animatedTabIndex.value = withTiming(index, { duration: 200 });
    fadeOpacity.value = withTiming(0, { duration: 100 }, (finished) => {
      "worklet";
      if (finished) runOnJS(completeTransition)(index);
    });
  }, [activeTab, animatedTabIndex, completeTransition, fadeOpacity]);
  const handleTabDoubleTap = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchUserStatus(), refetchProfile(), refetchPosts()]);
      if (userAddress) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.userPostsForOwner(userAddress),
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, refetchPosts, refetchProfile, refetchUserStatus, userAddress]);

  const handleFollow = useCallback(() => {
    if (userAddress) handleFollowUser(userAddress, displayUsername || "user", false);
  }, [displayUsername, handleFollowUser, userAddress]);
  const handleUnfollow = useCallback(() => {
    if (userAddress) handleFollowUser(userAddress, displayUsername || "user", true);
  }, [displayUsername, handleFollowUser, userAddress]);
  const handleConfirmBlockUser = useCallback(() => {
    if (!userAddress) return;
    setOptimisticBlocked(true);
    setIsBlockingUser(true);
    setShowBlockUserConfirmation(false);
    toast.promise(blockUserMutation.mutateAsync(userAddress), {
      loading: `Blocking @${displayUsername || "user"}...`,
      success: `Blocked @${displayUsername || "user"}`,
      error: "Failed to block user",
    }).catch(() => {
      Sentry.addBreadcrumb({ category: "user-profile", message: "Block user failed", level: "warning" });
      setOptimisticBlocked(null);
    }).finally(() => setIsBlockingUser(false));
  }, [blockUserMutation, displayUsername, toast, userAddress]);
  const handleUnblockUser = useCallback(() => {
    if (!userAddress) return;
    setOptimisticBlocked(false);
    toast.promise(unblockUserMutation.mutateAsync(userAddress), {
      loading: `Unblocking @${displayUsername || "user"}...`,
      success: `Unblocked @${displayUsername || "user"}`,
      error: "Failed to unblock user",
    }).catch(() => {
      Sentry.addBreadcrumb({ category: "user-profile", message: "Unblock user failed", level: "warning" });
      setOptimisticBlocked(null);
    });
  }, [displayUsername, toast, unblockUserMutation, userAddress]);

  const handleCopyProfileLink = useCallback(async () => {
    await Clipboard.setStringAsync(`${getShareBaseUrl(shareServer)}/u/${username}`);
    triggerHaptic("success");
    toast.success("Profile link copied");
  }, [shareServer, toast, username]);
  const handleShareProfile = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out @${username} on Mirage!`,
        url: `${getShareBaseUrl(shareServer)}/u/${username}`,
      });
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "user-profile",
        message: "Share profile failed",
        data: { error: String(error) },
        level: "warning",
      });
      Sentry.captureException(error, {
        tags: { feature: "user-profile", operation: "share-profile" },
      });
    }
  }, [shareServer, username]);
  const presentGiftSheet = useCallback((kind: "mirage" | "subscription") => {
    if (!userAddress || isOwnProfile) return;
    Sentry.addBreadcrumb({
      category: "user-profile",
      message: `Open gift-${kind} sheet`,
      data: { target: userAddress },
      level: "info",
    });
    setTimeout(() => {
      if (kind === "mirage") giftMirageSheetRef.current?.present();
      if (kind === "subscription") giftSubscriptionSheetRef.current?.present();
    }, 300);
  }, [isOwnProfile, userAddress]);
  const handleReportUserSubmit = useCallback((_reason: string) => {
    if (!userAddress) return;
    const loadingId = toast.loading("Submitting report...");
    reportSheetRef.current?.dismiss();
    setTimeout(() => {
      toast.update(loadingId, {
        type: "success",
        title: "Report submitted",
        description: "Thank you for helping keep Mirage safe",
        duration: 4000,
      });
      setTimeout(() => toast.dismiss(loadingId), 4000);
    }, 800);
  }, [toast, userAddress]);

  const handleAuthorPress = useCallback((authorId: string) => {
    if (authorId === userAddress || authorId === id || authorId === displayUsername) {
      toast.info("You're already viewing this profile");
      return;
    }
    router.push(`/user/${authorId}`);
  }, [displayUsername, id, router, toast, userAddress]);
  const handleCommentPress = useCallback((commentId: string, rootPostId: string) => {
    if (!rootPostId || rootPostId === "undefined") {
      console.warn("Cannot navigate: missing root post ID for comment", commentId);
      return;
    }
    router.push(`/post/${rootPostId}?highlight=${commentId}`);
  }, [router]);
  const handlePostMorePress = useCallback((postId: string) => {
    const post = postsById.get(postId);
    if (post) requireAuth(() => postActionSheetsRef.current?.openPost(post));
  }, [postsById, requireAuth]);

  const {
    activeVideoPostId,
    visibleVideoPostIds,
    nearbyVideoPostIds,
    profileViewabilityConfig,
    onProfileViewableItemsChanged,
    handleProfileMomentumScrollEnd,
    revealVideoPost,
  } = useProfileFeedVideoState({ activeTab, listData });
  const handleRevealContent = useCallback((postId: string) => {
    markSeen(postId, "open");
    setRevealedPosts((previous) => new Set(previous).add(postId));
    if (postHasPlayableVideo(uiPosts.find((post) => post.id === postId))) {
      revealVideoPost(postId);
    }
  }, [revealVideoPost, uiPosts]);
  const handleEndReached = useCallback(() => {
    if (activeTab === 2 || isBlocked || !hasUserScrolled.value) return;
    const now = Date.now();
    if (hasNextPage && !isFetchingNextPage && !isFetchingRef.current && now - lastFetchTime.current > 1000) {
      lastFetchTime.current = now;
      isFetchingRef.current = true;
      fetchNextPage().finally(() => { isFetchingRef.current = false; });
    }
  }, [activeTab, fetchNextPage, hasNextPage, hasUserScrolled, isBlocked, isFetchingNextPage]);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (!hasUserScrolled.value && event.contentOffset.y > 100) hasUserScrolled.value = true;
    },
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

  const handleBackPress = useCallback(() => router.back(), [router]);
  const handleFollowersPress = useCallback(() => {
    const followId = userAddress || id;
    if (followId) router.push(`/user-following/${followId}`);
  }, [id, router, userAddress]);
  const handleMenuPress = useCallback(() => {
    if (!isOwnProfile) requireAuth(() => userMenuSheetRef.current?.present());
  }, [isOwnProfile, requireAuth]);
  const handlePostPress = useCallback(
    (postId: string) => router.push(`/post/${postId}`),
    [router],
  );
  const handleTopicPress = useCallback(
    (topic: string) => router.push(`/topic/${encodeURIComponent(topic)}`),
    [router],
  );
  const handleSettingsPress = useCallback(() => router.push("/settings"), [router]);
  const handleRequestBlockUser = useCallback(() => setShowBlockUserConfirmation(true), []);
  const handleCancelBlockUser = useCallback(() => setShowBlockUserConfirmation(false), []);
  const handleReportUser = useCallback(() => reportSheetRef.current?.present(), []);
  const handleGiftMirageToUser = useCallback(() => presentGiftSheet("mirage"), [presentGiftSheet]);
  const handleGiftSubscriptionToUser = useCallback(
    () => presentGiftSheet("subscription"),
    [presentGiftSheet],
  );
  const handleBlockUserFromCard = useCallback(
    (_postId: string, authorId: string, authorUsername: string) =>
      postActionSheetsRef.current?.requestBlockUser(authorId, authorUsername),
    [],
  );
  const handleBlockPostFromCard = useCallback(
    (postId: string) => postActionSheetsRef.current?.requestBlockPost(postId),
    [],
  );
  const handleReportFromCard = useCallback(
    (postId: string) => postActionSheetsRef.current?.requestReportPost(postId),
    [],
  );

  return {
    activeTab, activeVideoPostId, animatedTabIndex, apiPosts, avatarUrl,
    contentAnimatedStyle, displayUsername, flatListRef,
    giftMirageSheetRef, giftSubscriptionSheetRef, gradientColors, handleAuthorPress,
    handleCommentPress, handleConfirmBlockUser, handleCopyProfileLink, handleDownvote,
    handleEndReached, handleFollow, handlePostMorePress, handleProfileMomentumScrollEnd,
    handleReportUserSubmit, handleRevealContent, handleShareProfile, handleTabChange,
    handleTabDoubleTap, handleUnblockUser, handleUnfollow, handleUpvote, headerHeight,
    isBlocked, isBlockingUser, isFetchingNextPage, isFocused, isFollowing, isLoading,
    isLoadingPosts, isOwnProfile, isRefreshing, isTabsSticky, listData,
    minimumContentHeight, nearbyVideoPostIds, onProfileViewableItemsChanged,
    postActionSheetsRef, profileData, profileViewabilityConfig, reportSheetRef,
    revealedPosts, router, scrollHandler, scrollY, setFeedScrolling,
    setShowBlockUserConfirmation, shareServer, showBlockUserConfirmation,
    stickyTabsAnimatedStyle, swipeGesture, uiPosts, userAddress, userMenuSheetRef,
    userProfileFeedContext, userStatus, username, visibleVideoPostIds,
    handleBackPress, handleFollowersPress, handleMenuPress, handlePostPress,
    handleTopicPress, handleSettingsPress, handleRequestBlockUser,
    handleCancelBlockUser, handleReportUser,
    handleGiftMirageToUser, handleGiftSubscriptionToUser,
    handleBlockUserFromCard, handleBlockPostFromCard, handleReportFromCard,
  };
}

export type UserProfileController = ReturnType<typeof useUserProfileController>;
