import { markSeen } from "@/src/services/seen-posts";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import * as Sentry from "@sentry/react-native";
import * as Clipboard from "expo-clipboard";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ListRenderItem,
  Platform,
  Share,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import {
  useProfileByAddress,
  useUserStatusByAddress,
  useAddressFromUsername,
  useUserFollowed,
  useUserBlocked,
  useInfiniteUserPosts,
} from "@/src/api/read";
import { getUserPosts } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import { transformApiPost } from "@/src/api/read/utils";
import type { Post as ApiPost, PostsResponse } from "@/src/api/types";
import {
  useBlockUser,
  useUnblockUser,
} from "@/src/api/write";
import {
  ConfirmationPopup,
  type Post,
  getGradientColor,
  PROFILE_CONTENT_HEIGHT,
  ProfileHeaderBar,
  ProfileTabBar,
  ReportSheet,
  ReportSheetRef,
  UserProfileMenuSheet,
  UserProfileMenuSheetRef,
  AwardPickerSheet,
  type AwardPickerSheetRef,
  GiftMirageSheet,
  type GiftMirageSheetRef,
  GiftSubscriptionSheet,
  type GiftSubscriptionSheetRef,
} from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { UserProfileContentAnimated } from "@/src/components/molecules/user-profile-content-animated";
import { Box } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  getBlockConfirmationMessage,
  useAuthGuard,
  useFollowHandler,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { useTabSwipeGesture } from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  getShareBaseUrl,
  useFeedScrollStore,
} from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  ProfilePostActionSheets,
  type ProfilePostActionSheetsRef,
} from "@/src/pages/profile/profile-post-action-sheets";
import { useProfileFeedVideoState } from "@/src/pages/profile/use-profile-feed-video-state";
import {
  UserProfileCommentWrapper,
  UserProfilePostWrapper,
} from "./user-profile-feed-items";
import { UserProfileListFooter } from "./user-profile-list-footer";
import { styles } from "./user-profile-styles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList<Post | ApiPost | "header" | "tabs">
);
const HEADER_BAR_HEIGHT = 56;
const formatMirageBalance = (umirage: number): number => {
  return Math.floor(umirage / 1_000_000);
};

const calculateAccountAgeDays = (
  createdAt: number | null | undefined
): number => {
  if (!createdAt) return 0;
  const now = Date.now() / 1000;
  const ageInSeconds = now - createdAt;
  return ageInSeconds / (60 * 60 * 24);
};
export function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  const currentUser = useAuthStore((s) => s.user);
  const flatListRef = useRef<FlatList<any>>(null);
  const userProfileFeedContext = useMemo(() => `profile:user:${id}:posts`, [id]);
  const setFeedScrolling = useCallback((isScrolling: boolean) => {
    useFeedScrollStore.getState().setContextScrolling(userProfileFeedContext, isScrolling);
  }, [userProfileFeedContext]);

  const isUsername = id && !id.startsWith("mirage");
  const { data: resolvedAddress, isLoading: isResolvingUsername } =
    useAddressFromUsername(isUsername ? id : null);

  const userAddress = isUsername
    ? resolvedAddress?.address ?? null
    : id ?? null;

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

  const scrollY = useSharedValue(0);
  const hasUserScrolled = useSharedValue(false);
  const animatedTabIndex = useSharedValue(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [isTabsSticky, setIsTabsSticky] = useState(false);

  const reportSheetRef = useRef<ReportSheetRef>(null);
  const postActionSheetsRef = useRef<ProfilePostActionSheetsRef>(null);
  const userMenuSheetRef = useRef<UserProfileMenuSheetRef>(null);
  const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
  const giftMirageSheetRef = useRef<GiftMirageSheetRef>(null);
  const giftSubscriptionSheetRef = useRef<GiftSubscriptionSheetRef>(null);
  const [showBlockUserConfirmation, setShowBlockUserConfirmation] =
    useState(false);
  const [isBlockingUser, setIsBlockingUser] = useState(false);
const [optimisticBlocked, setOptimisticBlocked] = useState<boolean | null>(
  null
);
 const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(
   null
 );

const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const hiddenCommentIds = useContentModerationStore((s) => s.hiddenCommentIds);

  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setVoteOverride(targetId, {
        hasLiked: result.hasLiked,
        hasDisliked: result.hasDisliked,
        likes: result.newLikes,
      });
    }, [setVoteOverride]),
    onRollback: useCallback((targetId: string) => {
      clearVoteOverride(targetId);
    }, [clearVoteOverride]),
  });

  const blockUserMutation = useBlockUser();
  const unblockUserMutation = useUnblockUser();
  const { handleFollowUser } = useFollowHandler({
    onOptimisticFollowUser: useCallback((_userId: string, isFollowing: boolean) => {
      setOptimisticFollowing(isFollowing);
    }, []),
    onRollbackFollowUser: useCallback(() => {
      setOptimisticFollowing(null);
    }, []),
  });

 const isFollowing = useMemo(() => {
    if (optimisticFollowing !== null) return optimisticFollowing;
   if (!userAddress || !followedData?.followed_users) return false;
   return followedData.followed_users.includes(userAddress);
  }, [userAddress, followedData?.followed_users, optimisticFollowing]);

  const isBlocked = useMemo(() => {
    if (optimisticBlocked !== null) return optimisticBlocked;
    if (!userAddress || !blockedData?.blocked_users) return false;
    return blockedData.blocked_users.includes(userAddress);
  }, [userAddress, blockedData?.blocked_users, optimisticBlocked]);

  const headerHeight = insets.top + HEADER_BAR_HEIGHT;
  const stickyThreshold = PROFILE_CONTENT_HEIGHT;
  const minimumContentHeight = useMemo(
    () => windowHeight + stickyThreshold + 1,
    [windowHeight, stickyThreshold],
  );

  const getTabType = useCallback((): "submissions" | "comments" => {
    return activeTab === 0 ? "submissions" : "comments";
  }, [activeTab]);

  const {
    data: postsData,
    fetchNextPage: _fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingPosts,
    refetch: refetchPosts,
  } = useInfiniteUserPosts(userAddress, {
    type: getTabType(),
    limit: 20,
  });

  const fetchNextPage = _fetchNextPage;

  const userPostsRefreshParams = useMemo(() => {
    if (!userAddress) return undefined;
    return {
      owner: userAddress,
      address: currentUser?.walletAddress ?? undefined,
      type: getTabType(),
      limit: 20,
    };
  }, [userAddress, currentUser?.walletAddress, getTabType]);

  usePostDataRefresher({
    userPostsParams: userPostsRefreshParams,
  });

  useEffect(() => {
    if (!userAddress) return;

    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.userPosts(
        userAddress,
        "comments",
        undefined,
        currentUser?.walletAddress,
      ),
      queryFn: ({ pageParam = 1 }) =>
        getUserPosts({
          owner: userAddress,
          address: currentUser?.walletAddress ?? undefined,
          page: pageParam,
          type: "comments",
          limit: 20,
        }),
      initialPageParam: 1,
      getNextPageParam: (lastPage: PostsResponse) => {
        if (!lastPage?.has_more) return undefined;
        return lastPage.page + 1;
      },
    });
  }, [currentUser?.walletAddress, queryClient, userAddress]);

  const postEditOverrides = usePostEditStore((s) => s.overrides);

  const apiPosts = useMemo(() => {
    const allPosts = postsData?.pages.flatMap((page) => page.posts) ?? [];
    if (getTabType() === "submissions") {
      return allPosts
        .filter((post) => !hiddenPostIds.has(post.post_id))
        .map((post) => {
          const ov = postEditOverrides[post.post_id];
          if (!ov) return post;
          return { ...post, title: ov.title, content: ov.content, topic: ov.topic ?? post.topic, media: ov.media ?? post.media };
        });
    }
    return allPosts.filter((post) => !hiddenCommentIds.has(post.post_id));
  }, [postsData, getTabType, hiddenPostIds, hiddenCommentIds, postEditOverrides]);

  const uiPosts = useMemo(
    () => apiPosts.map((post) => transformApiPost(post, {
      currentUser: currentUser ? { id: currentUser.id, username: currentUser.username } : undefined,
    })),
    [apiPosts, currentUser]
  );

 const listData = useMemo((): Array<Post | ApiPost | "header" | "tabs"> => {
    if (isBlocked || activeTab === 2) {
      return ["header", "tabs"];
    }
    const posts = activeTab === 0 ? uiPosts : apiPosts;
    return ["header", "tabs", ...posts];
  }, [activeTab, uiPosts, apiPosts, isBlocked]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (!hasUserScrolled.value && event.contentOffset.y > 100) {
        hasUserScrolled.value = true;
      }
    },
  });

  const profileData = useMemo(() => {
    const balance = userStatus?.balance ?? 0;
    const reserve = userStatus?.reserve_funds ?? 0;
    const createdAt = profile?.created_at ?? userStatus?.profile_registered_at;
    const accountAgeDays = calculateAccountAgeDays(createdAt);

    return {
      balance: formatMirageBalance(balance),
      reserve: formatMirageBalance(reserve),
      accountAgeDays,
    };
  }, [userStatus, profile]);

  const displayUsername = userStatus?.username ?? profile?.username;
 const username = displayUsername ?? "user";
 const avatarUrl = profile?.avatar || undefined;

 const gradientColors = useMemo(() => getGradientColor(username), [username]);
  const isLoading = isResolvingUsername || isLoadingStatus || isLoadingProfile;
  const isOwnProfile = currentUser?.walletAddress === userAddress;

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleMenuPress = useCallback(() => {
    if (!isOwnProfile) {
      requireAuth(() => {
        userMenuSheetRef.current?.present();
      });
    }
  }, [isOwnProfile, requireAuth]);

  const handleFollowersPress = useCallback(() => {
    const followId = userAddress || id;
    if (followId) {
      router.push(`/user-following/${followId}`);
    }
  }, [router, userAddress, id]);

  const handleFollow = useCallback(() => {
    if (!userAddress) return;
    handleFollowUser(userAddress, displayUsername || "user", false);
  }, [userAddress, displayUsername, handleFollowUser]);

  const handleUnfollow = useCallback(() => {
    if (!userAddress) return;
    handleFollowUser(userAddress, displayUsername || "user", true);
  }, [userAddress, displayUsername, handleFollowUser]);

  const handleRequestBlockUser = useCallback(() => {
    setShowBlockUserConfirmation(true);
  }, []);

  const handleConfirmBlockUser = useCallback(() => {
    if (!userAddress) return;
    setOptimisticBlocked(true);
    setIsBlockingUser(true);
    setShowBlockUserConfirmation(false);
    toast
      .promise(blockUserMutation.mutateAsync(userAddress), {
        loading: `Blocking @${displayUsername || "user"}...`,
        success: `Blocked @${displayUsername || "user"}`,
        error: "Failed to block user",
      })
      .catch(() => {
        Sentry.addBreadcrumb({
          category: "user-profile",
          message: "Block user failed",
          level: "warning",
        });
        setOptimisticBlocked(null);
      })
      .finally(() => {
        setIsBlockingUser(false);
      });
  }, [userAddress, displayUsername, blockUserMutation, toast]);

  const handleCancelBlockUser = useCallback(() => {
    setShowBlockUserConfirmation(false);
  }, []);

  const handleUnblockUser = useCallback(() => {
    if (!userAddress) return;
    setOptimisticBlocked(false);
    toast
      .promise(unblockUserMutation.mutateAsync(userAddress), {
        loading: `Unblocking @${displayUsername || "user"}...`,
        success: `Unblocked @${displayUsername || "user"}`,
        error: "Failed to unblock user",
      })
      .catch(() => {
        Sentry.addBreadcrumb({
          category: "user-profile",
          message: "Unblock user failed",
          level: "warning",
        });
        setOptimisticBlocked(null);
      });
  }, [userAddress, displayUsername, unblockUserMutation, toast]);

  const handleReportUser = useCallback(() => {
    reportSheetRef.current?.present();
  }, []);

  const handleCopyProfileLink = useCallback(async () => {
    const profileUrl = `${getShareBaseUrl(shareServer)}/u/${username}`;
    await Clipboard.setStringAsync(profileUrl);
    triggerHaptic("success");
    toast.success("Profile link copied");
  }, [shareServer, username, toast]);

  const handleShareProfile = useCallback(async () => {
    try {
      const profileUrl = `${getShareBaseUrl(shareServer)}/u/${username}`;
      await Share.share({
        message: `Check out @${username} on Mirage!`,
        url: profileUrl,
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

  const handleGiveAwardToUser = useCallback(() => {
    if (!userAddress || isOwnProfile) return;
    Sentry.addBreadcrumb({
      category: "user-profile",
      message: "Open give-award sheet",
      data: { target: userAddress },
      level: "info",
    });
    setTimeout(() => awardPickerSheetRef.current?.present(), 300);
  }, [userAddress, isOwnProfile]);

  const handleGiftMirageToUser = useCallback(() => {
    if (!userAddress || isOwnProfile) return;
    Sentry.addBreadcrumb({
      category: "user-profile",
      message: "Open gift-mirage sheet",
      data: { target: userAddress },
      level: "info",
    });
    setTimeout(() => giftMirageSheetRef.current?.present(), 300);
  }, [userAddress, isOwnProfile]);

  const handleGiftSubscriptionToUser = useCallback(() => {
    if (!userAddress || isOwnProfile) return;
    Sentry.addBreadcrumb({
      category: "user-profile",
      message: "Open gift-subscription sheet",
      data: { target: userAddress },
      level: "info",
    });
    setTimeout(() => giftSubscriptionSheetRef.current?.present(), 300);
  }, [userAddress, isOwnProfile]);

  const handleReportUserSubmit = useCallback(
    (reason: string) => {
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
    },
    [userAddress, toast]
  );

  const handleSettingsPress = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleCommentPress = useCallback(
    (commentId: string, rootPostId: string) => {
      if (!rootPostId || rootPostId === "undefined") {
        console.warn(
          "Cannot navigate: missing root post ID for comment",
          commentId
        );
        return;
      }
      router.push(`/post/${rootPostId}?highlight=${commentId}`);
    },
    [router]
  );

 const handleAuthorPress = useCallback(
   (authorId: string) => {
      if (authorId === userAddress || authorId === id || authorId === displayUsername) {
        toast.info("You're already viewing this profile");
        return;
      }
     router.push(`/user/${authorId}`);
   },
    [router, userAddress, id, displayUsername, toast]
 );

  const handleTopicPress = useCallback(
    (topic: string) => {
      router.push(`/topic/${encodeURIComponent(topic)}`);
    },
    [router],
  );

  const postsById = useMemo(() => {
    const map = new Map<string, Post>();
    for (const post of uiPosts) {
      map.set(post.id, post);
    }
    return map;
  }, [uiPosts]);

  const handlePostMorePress = useCallback(
    (postId: string) => {
      const post = postsById.get(postId);
      if (post) {
        requireAuth(() => {
          postActionSheetsRef.current?.openPost(post);
        });
      }
    },
    [postsById, requireAuth]
  );

  const handleBlockUserFromCard = useCallback(
    (postId: string, authorId: string, authorUsername: string) => {
      postActionSheetsRef.current?.requestBlockUser(authorId, authorUsername);
    },
    []
  );

  const handleBlockPostFromCard = useCallback(
    (postId: string) => {
      postActionSheetsRef.current?.requestBlockPost(postId);
    },
    []
  );

  const handleReportFromCard = useCallback(
    (postId: string) => {
      postActionSheetsRef.current?.requestReportPost(postId);
    },
    []
  );

  const handleSwipeTabChange = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  const { swipeGesture, contentAnimatedStyle, fadeOpacity, completeTransition } = useTabSwipeGesture({
    onTabChange: handleSwipeTabChange,
    animatedIndex: animatedTabIndex,
  });

  const handleTabChange = useCallback((index: number) => {
    if (index === activeTab) return;
    animatedTabIndex.value = withTiming(index, { duration: 200 });
    fadeOpacity.value = withTiming(
      0,
      { duration: 100 },
      (finished) => {
        "worklet";
        if (finished) {
          runOnJS(completeTransition)(index);
        }
      },
    );
  }, [activeTab, animatedTabIndex, fadeOpacity, completeTransition]);

  const handleTabDoubleTap = useCallback(
    async (index: number) => {
      setIsRefreshing(true);
      try {
        await Promise.all([
          refetchUserStatus(),
          refetchProfile(),
          refetchPosts(),
        ]);
        if (userAddress) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.userPostsForOwner(userAddress),
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [refetchUserStatus, refetchProfile, refetchPosts, queryClient, userAddress]
  );

  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);

  const handleEndReached = useCallback(() => {
    if (activeTab === 2 || isBlocked || !hasUserScrolled.value) return;
    const now = Date.now();
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchingRef.current &&
      now - lastFetchTime.current > 1000
    ) {
      lastFetchTime.current = now;
      isFetchingRef.current = true;
      fetchNextPage().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, activeTab, isBlocked]);

  const {
    activeVideoPostId,
    visibleVideoPostIds,
    nearbyVideoPostIds,
    profileViewabilityConfig,
    onProfileViewableItemsChanged,
    handleProfileMomentumScrollEnd,
    revealVideoPost,
  } = useProfileFeedVideoState({ activeTab, listData });
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const handleRevealContent = useCallback((postId: string) => {
    markSeen(postId, "open");
    setRevealedPosts((prev) => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });
    const post = uiPosts.find((p) => p.id === postId);
    if (postHasPlayableVideo(post)) {
      revealVideoPost(postId);
    }
  }, [uiPosts, revealVideoPost]);

  const keyExtractor = useCallback(
    (item: Post | ApiPost | "header" | "tabs", index: number) => {
      if (item === "header") return "header";
      if (item === "tabs") return "tabs";
      return "id" in item ? item.id : item.post_id;
    },
    []
  );

  const renderItem: ListRenderItem<Post | ApiPost | "header" | "tabs"> =
    useCallback(
      ({ item, index }) => {
        if (item === "header") {
          return (
           <UserProfileContentAnimated
             username={username}
             avatarSeed={userAddress || username}
             avatarUrl={avatarUrl}
            walletAddress={userAddress || "0x0000...0000"}
            balance={profileData.balance}
             reserve={profileData.reserve}
             accountAgeDays={profileData.accountAgeDays}
             gradientColors={gradientColors}
             scrollY={scrollY}
             onFollowersPress={handleFollowersPress}
             isLoading={isLoading}
            headerHeight={headerHeight}
           />
          );
        }

        if (item === "tabs") {
          if (isTabsSticky) {
            return <View style={styles.inlineTabPlaceholder} />;
          }

          return (
            <View style={{ backgroundColor: theme.colors.background.default }}>
              <ProfileTabBar
                activeTab={activeTab}
                onTabChange={handleTabChange}
                onTabDoubleTap={handleTabDoubleTap}
                tabWidth={SCREEN_WIDTH}
                animatedIndex={animatedTabIndex}
              />
            </View>
          );
        }

       if (activeTab === 0 && "id" in item) {
        return (
          <Animated.View style={contentAnimatedStyle}>
            <UserProfilePostWrapper
             post={item}
             isOwnProfile={isOwnProfile}
             isVisible={visibleVideoPostIds.has(item.id)}
             isFocused={activeVideoPostId === item.id}
             isNearVisible={nearbyVideoPostIds.has(item.id)}
             screenActive={isFocused}
             contentRevealed={revealedPosts.has(item.id)}
             videoSyncScope={userProfileFeedContext}
             shareUrl={`${getShareBaseUrl(shareServer)}/p/${item.id}`}
             onPostPress={handlePostPress}
             onAuthorPress={handleAuthorPress}
             onCommentPress={handlePostPress}
             onMorePress={handlePostMorePress}
             onLikePress={handleUpvote}
             onDislikePress={handleDownvote}
             onBlockUser={handleBlockUserFromCard}
             onBlockPost={handleBlockPostFromCard}
             onReport={handleReportFromCard}
             onRevealContent={handleRevealContent}
             onTopicPress={handleTopicPress}
            />
          </Animated.View>
         );
       }

        if (activeTab === 1 && "post_id" in item) {
          return (
            <Animated.View style={contentAnimatedStyle}>
              <UserProfileCommentWrapper
               comment={item}
               onPress={handleCommentPress}
              />
            </Animated.View>
          );
        }

        return null;
     },
    [
     username,
     userAddress,
     avatarUrl,
     profileData,
      gradientColors,
      scrollY,
      handleFollowersPress,
       isLoading,
      headerHeight,
       isTabsSticky,
       theme.colors.background.default,
       activeTab,
       handleTabChange,
       handleTabDoubleTap,
       isOwnProfile,
      handlePostPress,
      handleAuthorPress,
      handlePostMorePress,
      handleCommentPress,
       handleUpvote,
       handleDownvote,
       shareServer,
       handleBlockUserFromCard,
       handleBlockPostFromCard,
       handleReportFromCard,
      contentAnimatedStyle,
      animatedTabIndex,
      activeVideoPostId,
      isFocused,
      revealedPosts,
      handleRevealContent,
    ]
  );

  const listFooter = useMemo(() => {
    return (
      <UserProfileListFooter
        activeTab={activeTab}
        contentAnimatedStyle={contentAnimatedStyle}
        isBlocked={isBlocked}
        isFetchingNextPage={isFetchingNextPage}
        isLoadingPosts={isLoadingPosts}
        isOwnProfile={isOwnProfile}
        listDataLength={listData.length}
        userAddress={userAddress}
        onSettingsPress={handleSettingsPress}
        onUnblock={handleUnblockUser}
      />
    );
  }, [
    activeTab,
    isLoadingPosts,
    isFetchingNextPage,
    listData.length,
    handleSettingsPress,
    isOwnProfile,
    isBlocked,
    handleUnblockUser,
    userAddress,
    contentAnimatedStyle,
  ]);

  const stickyTabsAnimatedStyle = useAnimatedStyle(() => {
    const isSticky = scrollY.value >= stickyThreshold;
    return {
      opacity: isSticky ? 1 : 0,
    } as any;
  });

  useAnimatedReaction(
    () => scrollY.value >= stickyThreshold,
    (nextIsSticky, previousIsSticky) => {
      if (nextIsSticky !== previousIsSticky) {
        runOnJS(setIsTabsSticky)(nextIsSticky);
      }
    },
    [stickyThreshold],
  );

  useEffect(() => {
    return () => {
      setFeedScrolling(false);
    };
  }, [setFeedScrolling]);

  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: headerHeight,
      paddingBottom: insets.bottom + 20,
      flexGrow: 1,
      minHeight: minimumContentHeight,
    }),
    [headerHeight, insets.bottom, minimumContentHeight]
  );

  return (
    <Box flex background="base">
    <ProfileHeaderBar
      username={username}
      userLevel={userStatus?.user_level ?? 0}
      gradientColors={gradientColors}
      scrollY={scrollY}
      isRefreshing={isRefreshing}
      isLoading={isLoading}
       isOwnProfile={isOwnProfile}
       isFollowing={isFollowing}
      onBackPress={handleBackPress}
       onFollowPress={handleFollow}
       onUnfollowPress={handleUnfollow}
      onMenuPress={handleMenuPress}
    />

      <Animated.View
        style={[
          styles.stickyTabBar,
          {
            top: headerHeight,
            backgroundColor: theme.colors.background.default,
          },
          stickyTabsAnimatedStyle,
        ]}
        pointerEvents={isTabsSticky ? "auto" : "none"}
      >
        <ProfileTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onTabDoubleTap={handleTabDoubleTap}
          tabWidth={SCREEN_WIDTH}
          animatedIndex={animatedTabIndex}
        />
      </Animated.View>

      <GestureDetector gesture={swipeGesture}>
        <AnimatedFlatList
          style={styles.list}
          ref={flatListRef as any}
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onScroll={scrollHandler}
          scrollEventThrottle={Platform.OS === "ios" ? 64 : 16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={contentContainerStyle}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={listFooter}
          removeClippedSubviews={true}
          maxToRenderPerBatch={Platform.OS === "android" ? 5 : 9}
          windowSize={Platform.OS === "android" ? 7 : 13}
          initialNumToRender={5}
          updateCellsBatchingPeriod={Platform.OS === "android" ? 100 : 50}
          bounces={true}
          viewabilityConfig={profileViewabilityConfig}
          onViewableItemsChanged={onProfileViewableItemsChanged}
          onScrollBeginDrag={() => setFeedScrolling(true)}
          onScrollEndDrag={() => setFeedScrolling(false)}
          onMomentumScrollBegin={() => setFeedScrolling(true)}
          onMomentumScrollEnd={() => {
            setFeedScrolling(false);
            handleProfileMomentumScrollEnd();
          }}
          extraData={revealedPosts}
        />
      </GestureDetector>

      {!isOwnProfile && (
        <UserProfileMenuSheet
          ref={userMenuSheetRef}
          username={displayUsername ?? undefined}
          isFollowing={isFollowing}
          isBlocked={isBlocked}
          isOwnProfile={isOwnProfile}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          onBlock={handleRequestBlockUser}
          onUnblock={handleUnblockUser}
          onReport={handleReportUser}
          onCopyProfileLink={handleCopyProfileLink}
          onShare={handleShareProfile}
          onGiveAward={handleGiveAwardToUser}
          onGiftMirage={handleGiftMirageToUser}
          onGiftSubscription={handleGiftSubscriptionToUser}
        />
      )}

      {!isOwnProfile && userAddress && (
        <>
          <AwardPickerSheet
            ref={awardPickerSheetRef}
            targetId={userAddress}
            targetType="user"
            isOwnContent={false}
          />
          <GiftMirageSheet
            ref={giftMirageSheetRef}
            recipientAddress={userAddress}
            recipientUsername={displayUsername ?? "user"}
          />
          <GiftSubscriptionSheet
            ref={giftSubscriptionSheetRef}
            recipientAddress={userAddress}
            recipientUsername={displayUsername ?? "user"}
          />
        </>
      )}

      <ProfilePostActionSheets
        ref={postActionSheetsRef}
        isOwnPost={isOwnProfile}
      />

      <ConfirmationPopup
        visible={showBlockUserConfirmation}
        title={`Block @${displayUsername || "user"}?`}
        message={getBlockConfirmationMessage("user")}
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        isLoading={isBlockingUser}
        onConfirm={handleConfirmBlockUser}
        onCancel={handleCancelBlockUser}
      />

      <ReportSheet
        ref={reportSheetRef}
        targetType="post"
        onSubmit={handleReportUserSubmit}
        onDismiss={() => undefined}
        isLoading={false}
      />
    </Box>
  );
}
