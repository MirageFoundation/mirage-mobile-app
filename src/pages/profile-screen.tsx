import { usePostEditStore } from "@/src/stores/post-edit-store";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  useWindowDimensions,
  type ViewToken,
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
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  useInfiniteUserPosts,
  useProfile,
  useUserStatus,
} from "@/src/api/read";
import { getUserPosts } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import { transformApiPost } from "@/src/api/read/utils";
import type { Post as ApiPost } from "@/src/api/types";
import {
  getGradientColor,
  type Post,
  PostOptionsSheetRef,
  PROFILE_CONTENT_HEIGHT,
  ProfileHeaderBar,
  ProfileTabBar,
  ReportSheetRef,
} from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { PROFILE_TAB_BAR_HEIGHT } from "@/src/components/molecules/profile-tabs";
import { Box } from "@/src/components/ui/primitives";
import { ProfileContentItem } from "./profile/profile-content-item";
import { ProfileFooter } from "./profile/profile-footer";
import { ProfileOverlays } from "./profile/profile-overlays";
import { useProfilePostActions } from "./profile/use-profile-post-actions";
import {
  useAppState,
  useBlockHandler,
  useDeleteHandler,
  useReportHandler,
  useTabSwipeGesture,
} from "@/src/hooks";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import {
  useAuthStore,
  useContentModerationStore,
  useSavedPostsStore,
} from "@/src/stores";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useEdit } from "@/src/api/write";
import { useToast } from "@/src/providers/toast-provider";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";
import {
  usePowQueueStore,
  generateActionId,
  getActionLabel,
} from "@/src/services/pow-queue";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList<Post | ApiPost | "header" | "tabs">,
);

const HEADER_BAR_HEIGHT = 56;

const formatMirageBalance = (umirage: number): number => {
  return Math.floor(umirage / 1_000_000);
};

const calculateAccountAgeDays = (
  createdAt: number | null | undefined,
): number => {
  if (!createdAt) return 0;
  const now = Date.now() / 1000;
  const ageInSeconds = now - createdAt;
  return ageInSeconds / (60 * 60 * 24);
};

export function ProfileScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();

  const { registerProfileRefresh, showBars } =
    useScrollAnimationContext();

  const flatListRef = useRef<FlatList<any>>(null);

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

  const scrollY = useSharedValue(0);
  const animatedTabIndex = useSharedValue(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [isTabsSticky, setIsTabsSticky] = useState(false);

  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const hiddenCommentIds = useContentModerationStore((s) => s.hiddenCommentIds);
  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalUnhidePost = useContentModerationStore((s) => s.unhidePost);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);
  const globalUnhideComment = useContentModerationStore((s) => s.unhideComment);
  const blockTopicOptimistic = useContentModerationStore((s) => s.blockTopic);

  const deleteHandler = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") {
        globalUnhidePost(targetId);
      } else {
        globalUnhideComment(targetId);
      }
    },
  });
  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});

 const toast = useToast();
 const pendingEdit = useCommentComposeStore((s) => s.pendingEdit);
 const clearPendingEdit = useCommentComposeStore((s) => s.clearPendingEdit);

 const editMutation = useEdit({});
  const editMutateAsyncRef = useRef(editMutation.mutateAsync);
  useEffect(() => {
    editMutateAsyncRef.current = editMutation.mutateAsync;
  }, [editMutation.mutateAsync]);
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const [commentEditOverrides, setCommentEditOverrides] = useState<
    Record<string, string>
  >({});

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
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingPosts,
    refetch: refetchPosts,
  } = useInfiniteUserPosts(user?.walletAddress ?? null, {
    type: getTabType(),
    limit: 20,
  });

  const userPostsRefreshParams = useMemo(() => {
    if (!user?.walletAddress) return undefined;
    return {
      owner: user.walletAddress,
      address: user.walletAddress,
      type: getTabType(),
      limit: 20,
    };
  }, [user?.walletAddress, getTabType]);

  usePostDataRefresher({
    userPostsParams: userPostsRefreshParams,
  });

  const [focusVersion, setFocusVersion] = useState(0);

  useEffect(() => {
    if (!user?.walletAddress) return;

    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.userPosts(user.walletAddress, "comments"),
      queryFn: ({ pageParam = 1 }) =>
        getUserPosts({
          owner: user.walletAddress,
          address: user.walletAddress,
          page: pageParam,
          type: "comments",
          limit: 20,
        }),
      initialPageParam: 1,
      getNextPageParam: (lastPage) => {
        if (!lastPage?.has_more) return undefined;
        return lastPage.page + 1;
      },
    });
  }, [queryClient, user?.walletAddress]);

 const apiPosts = useMemo(() => {
   const postOverrides = usePostEditStore.getState().overrides;
   const allPosts = postsData?.pages.flatMap((page) => page.posts) ?? [];
   if (getTabType() === "submissions") {
     return allPosts
       .filter((post) => !hiddenPostIds.has(post.post_id))
       .map((post) => {
         const editOv = postOverrides[post.post_id];
         if (!editOv) return post;
         return { ...post, title: editOv.title, content: editOv.content, topic: editOv.topic ?? post.topic, media: editOv.media ?? post.media };
       });
   }
    return allPosts
      .filter((post) => !hiddenCommentIds.has(post.post_id))
      .map((post) => {
        const override = commentEditOverrides[post.post_id];
        return override !== undefined ? { ...post, content: override } : post;
      });
  }, [postsData, getTabType, hiddenPostIds, hiddenCommentIds, commentEditOverrides]);

  const uiPosts = useMemo(
    () => apiPosts.map((post) => transformApiPost(post, {
      currentUser: user ? { id: user.id, username: user.username } : undefined,
    })),
    [apiPosts, user],
  );

const listData = useMemo((): (Post | ApiPost | "header" | "tabs")[] => {
   if (activeTab === 2) {
      return ["header", "tabs"];
   }
    const posts = activeTab === 0 ? uiPosts : apiPosts;
    return ["header", "tabs", ...posts];
  }, [activeTab, uiPosts, apiPosts]);
  const listDataRef = useRef(listData);
  listDataRef.current = listData;

  useEffect(() => {
    const handleRefresh = async () => {
      if (flatListRef.current) {
        if ("scrollToOffset" in flatListRef.current) {
          flatListRef.current.scrollToOffset({ offset: 0, animated: true });
        }
      }
      setIsRefreshing(true);
      try {
        await Promise.all([
          refetchUserStatus(),
          refetchProfile(),
          refetchPosts(),
        ]);
        if (user?.walletAddress) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.userPostsRoot(user.walletAddress),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.userBlocked(user.walletAddress),
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    };
    registerProfileRefresh(handleRefresh);
  }, [
    registerProfileRefresh,
    refetchUserStatus,
    refetchProfile,
    refetchPosts,
    queryClient,
    user?.walletAddress,
  ]);

  useFocusEffect(
    useCallback(() => {
      showBars();
      setFocusVersion((v) => v + 1);
      if (user?.walletAddress) {
        refetchUserStatus();
        refetchProfile();
        queryClient.invalidateQueries({
          queryKey: queryKeys.userPostsRoot(user.walletAddress),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.userBlocked(user.walletAddress),
        });
      }
    }, [showBars, queryClient, user?.walletAddress, refetchUserStatus, refetchProfile]),
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
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

 const username = userStatus?.username ?? user?.username ?? "user";
 const avatarUrl = profile?.avatar || undefined;

 const gradientColors = useMemo(() => getGradientColor(username), [username]);
  const isLoading = isLoadingStatus || isLoadingProfile;

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleEditUsernamePress = useCallback(() => {
    router.push("/change-username");
  }, [router]);

  const handleFollowersPress = useCallback(() => {
    const id = user?.walletAddress || user?.username;
    if (id) {
      router.push(`/user-following/${id}`);
    }
  }, [router, user?.walletAddress, user?.username]);

  const handleSettingsPress = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleBlockedPress = useCallback(() => {
    router.push("/blocked-list");
  }, [router]);

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
  );

  const handleCommentPress = useCallback(
    (commentId: string, rootPostId: string) => {
      if (!rootPostId || rootPostId === "undefined") {
        console.warn(
          "Cannot navigate: missing root post ID for comment",
          commentId,
        );
        return;
      }
      router.push(`/post/${rootPostId}?highlight=${commentId}`);
    },
    [router],
  );

useEffect(() => {
  if (pendingEdit && pendingEdit.source === "profile") {
    const { commentId, parentId, text, imageUri, gifUrl } = pendingEdit;
    clearPendingEdit();

    if (!commentId || commentId.startsWith("optimistic-")) return;

   let finalContent = text;
    if (imageUri) {
      finalContent = text.trim() ? `${imageUri}\n\n${text.trim()}` : imageUri;
    } else if (gifUrl) {
      finalContent = text.trim() ? `${gifUrl}\n\n${text.trim()}` : gifUrl;
    }

      setCommentEditOverrides((prev) => ({ ...prev, [commentId]: finalContent }));

      const actionId = generateActionId();
      enqueue({
        id: actionId,
        type: "edit",
        label: getActionLabel("edit"),
        execute: async () => {
          return editMutateAsyncRef.current({
            postId: commentId,
            parentId,
            title: "",
            content: finalContent,
            tag: "",
          });
        },
        onSuccess: () => {
          setTimeout(async () => {
            await refetchPosts();
            setCommentEditOverrides((prev) => {
              const next = { ...prev };
              delete next[commentId];
              return next;
            });
          }, 3000);
        },
        onError: () => {
          setCommentEditOverrides((prev) => {
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        },
      });
   }
 }, [pendingEdit, clearPendingEdit, enqueue, refetchPosts]);

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      router.push(`/user/${authorId}`);
    },
    [router],
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

  const {
    handlePostMorePress,
    handleEditPost,
    handleDeletePost,
    handleBlockPost,
    handleReportPost,
    handleConfirmDelete,
    handleConfirmBlock,
    handleReportSubmit,
  } = useProfilePostActions({
    router,
    selectedPost,
    setSelectedPost,
    postOptionsSheetRef,
    reportSheetRef,
    deleteHandler,
    blockHandler,
    reportHandler,
    globalHidePost,
    globalHideComment,
    blockTopicOptimistic,
    postsById,
  });

  const handleSwipeTabChange = useCallback((index: number) => {
    setActiveTab(index);
    showBars();
  }, [showBars]);

  const { swipeGesture, contentAnimatedStyle, fadeOpacity, completeTransition } = useTabSwipeGesture({
    onTabChange: handleSwipeTabChange,
    animatedIndex: animatedTabIndex,
  });

  const handleTabChange = useCallback((index: number) => {
    if (index === activeTab) return;
    showBars();
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
  }, [activeTab, showBars, animatedTabIndex, fadeOpacity, completeTransition]);

  const handleTabDoubleTap = useCallback(
    async (index: number) => {
      if (flatListRef.current) {
        if ("scrollToOffset" in flatListRef.current) {
          flatListRef.current.scrollToOffset({ offset: 0, animated: true });
        }
      }
      setIsRefreshing(true);
      try {
        await Promise.all([
          refetchUserStatus(),
          refetchProfile(),
          refetchPosts(),
        ]);
        if (user?.walletAddress) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.userPostsRoot(user.walletAddress),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.userBlocked(user.walletAddress),
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [refetchUserStatus, refetchProfile, refetchPosts, queryClient, user?.walletAddress],
  );

  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [visibleVideoPostIds, setVisibleVideoPostIds] = useState<Set<string>>(new Set());
  const [warmVideoPostIds, setWarmVideoPostIds] = useState<Set<string>>(new Set());

  const profileViewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
    minimumViewTime: 300,
  }).current;

  const pendingProfileViewableRef = useRef<ViewToken[] | null>(null);
  const profileDeferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushProfileViewability = () => {
    const items = pendingProfileViewableRef.current;
    if (!items) return;
    const visibleItems = items.filter(
      (item) => item.isViewable && item.item && typeof item.item === "object" && "id" in item.item
    );
    if (visibleItems.length === 0) {
      setVisibleVideoPostIds(new Set());
      setWarmVideoPostIds(new Set());
      setActiveVideoPostId(null);
      return;
    }
    const videoItems = visibleItems.filter(
      (item) => postHasPlayableVideo(item.item)
    );
    const newVisibleIds = new Set(videoItems.map((item) => item.item.id));
    setVisibleVideoPostIds(newVisibleIds);
    const warmVideoIds = new Set<string>(newVisibleIds);
    const sortedVisibleIndices = visibleItems
      .map((v) => v.index ?? 0)
      .sort((a, b) => a - b);
    const currentListData = listDataRef.current;
    const warmMinIndex = Math.max(0, (sortedVisibleIndices[0] ?? 0) - 2);
    const warmMaxIndex = Math.min(currentListData.length - 1, (sortedVisibleIndices[sortedVisibleIndices.length - 1] ?? 0) + 2);
    for (let i = warmMinIndex; i <= warmMaxIndex; i++) {
      const listItem = currentListData[i];
      if (listItem && typeof listItem === "object" && "id" in listItem && postHasPlayableVideo(listItem)) {
        warmVideoIds.add(listItem.id);
      }
    }
    setWarmVideoPostIds(warmVideoIds);
    if (videoItems.length > 0) {
      const sortedIndices = visibleItems
        .map((v) => v.index ?? 0)
        .sort((a, b) => a - b);
      const mid = Math.floor((sortedIndices.length - 1) / 2);
      const centerIndex = sortedIndices[mid] ?? 0;
      const visibleSpan = (sortedIndices[sortedIndices.length - 1] ?? 0) - (sortedIndices[0] ?? 0);
      const maxDist = Math.max(1, visibleSpan * 0.35);
      let best = videoItems[0];
      let bestDist = Math.abs((best.index ?? 0) - centerIndex);
      for (let i = 1; i < videoItems.length; i++) {
        const d = Math.abs((videoItems[i].index ?? 0) - centerIndex);
        if (d < bestDist) { best = videoItems[i]; bestDist = d; }
      }
      setActiveVideoPostId(bestDist <= maxDist ? best.item.id : null);
    } else {
      setActiveVideoPostId(null);
    }
  };

  const activeVideoPostIdRef = useRef(activeVideoPostId);
  activeVideoPostIdRef.current = activeVideoPostId;

  const onProfileViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingProfileViewableRef.current = viewableItems;

      const currentActive = activeVideoPostIdRef.current;
      if (currentActive) {
        const stillVisible = viewableItems.some(
          (v) => v.isViewable && v.item && typeof v.item === "object" && "id" in v.item && v.item.id === currentActive
        );
        if (!stillVisible) {
          setActiveVideoPostId(null);
        }
      }

      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current as ReturnType<typeof setTimeout>);
      }
      profileDeferHandleRef.current = setTimeout(flushProfileViewability, Platform.OS === "ios" ? 200 : 150);
    }
  ).current;

  const handleProfileMomentumScrollEnd = useCallback(() => {
    if (profileDeferHandleRef.current !== null) {
      clearTimeout(profileDeferHandleRef.current as ReturnType<typeof setTimeout>);
      profileDeferHandleRef.current = null;
    }
    if (Platform.OS === "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(flushProfileViewability);
      });
    } else {
      setTimeout(() => {
        requestAnimationFrame(flushProfileViewability);
      }, 50);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current as ReturnType<typeof setTimeout>);
      }
    };
  }, []);

  useAppState({
    onBackground: () => {
      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current as ReturnType<typeof setTimeout>);
        profileDeferHandleRef.current = null;
      }
      setVisibleVideoPostIds(new Set());
      setWarmVideoPostIds(new Set());
      setActiveVideoPostId(null);
    },
    onForeground: () => {
      if (activeTab !== 0) return;
      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current as ReturnType<typeof setTimeout>);
        profileDeferHandleRef.current = null;
      }
      requestAnimationFrame(() => {
        flushProfileViewability();
      });
    },
  });

  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);

 const handleEndReached = useCallback(() => {
    if (activeTab === 2) return;
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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, activeTab]);

  const keyExtractor = useCallback(
    (item: Post | ApiPost | "header" | "tabs") => {
      if (item === "header") return "header";
      if (item === "tabs") return "tabs";
      return "id" in item ? item.id : item.post_id;
    },
    [],
  );

  const postsWithoutWarnings = useMemo(() => {
   const map = new Map<string, Post>();
   for (const post of uiPosts) {
    map.set(post.id, { ...post, contentWarnings: undefined });
   }
   return map;
  }, [uiPosts]);

  const renderItem = useCallback(
    ({ item }: { item: Post | ApiPost | "header" | "tabs" }) => (
      <ProfileContentItem
        item={item}
        username={username}
        walletAddress={user?.walletAddress}
        avatarUrl={avatarUrl}
        balance={profileData.balance}
        reserve={profileData.reserve}
        accountAgeDays={profileData.accountAgeDays}
        gradientColors={gradientColors}
        scrollY={scrollY}
        onFollowersPress={handleFollowersPress}
        onEditUsernamePress={handleEditUsernamePress}
        isLoading={isLoading}
        headerHeight={headerHeight}
        isTabsSticky={isTabsSticky}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onTabDoubleTap={handleTabDoubleTap}
        animatedTabIndex={animatedTabIndex}
        tabWidth={SCREEN_WIDTH}
        contentAnimatedStyle={contentAnimatedStyle}
        postsWithoutWarnings={postsWithoutWarnings}
        visibleVideoPostIds={visibleVideoPostIds}
        warmVideoPostIds={warmVideoPostIds}
        activeVideoPostId={activeVideoPostId}
        screenActive={isFocused}
        onPostPress={handlePostPress}
        onAuthorPress={handleAuthorPress}
        onMorePress={handlePostMorePress}
        onCommentPress={handleCommentPress}
        onTopicPress={handleTopicPress}
      />
    ),
    [
      username,
      user?.walletAddress,
      avatarUrl,
      profileData,
      gradientColors,
      scrollY,
      handleFollowersPress,
      handleEditUsernamePress,
      isLoading,
      headerHeight,
      isTabsSticky,
      activeTab,
      handleTabChange,
      handleTabDoubleTap,
      animatedTabIndex,
      contentAnimatedStyle,
      postsWithoutWarnings,
      visibleVideoPostIds,
      warmVideoPostIds,
      activeVideoPostId,
      isFocused,
      handlePostPress,
      handleAuthorPress,
      handlePostMorePress,
      handleCommentPress,
      handleTopicPress,
    ],
  );

  const ListFooterComponent = useCallback(
    () => (
      <ProfileFooter
        activeTab={activeTab}
        isLoadingPosts={isLoadingPosts}
        isFetchingNextPage={isFetchingNextPage}
        hasContent={listData.length > 2}
        contentAnimatedStyle={contentAnimatedStyle}
        userAddress={user?.walletAddress}
        onBlockedPress={handleBlockedPress}
        onSettingsPress={handleSettingsPress}
        bottomSpacerHeight={80}
      />
    ),
    [
      activeTab,
      isLoadingPosts,
      isFetchingNextPage,
      listData.length,
      contentAnimatedStyle,
      user?.walletAddress,
      handleBlockedPress,
      handleSettingsPress,
    ],
  );

  const stickyTabsAnimatedStyle = useAnimatedStyle(() => {
    const isSticky = scrollY.value >= stickyThreshold;
    return {
      opacity: isSticky ? 1 : 0,
      pointerEvents: isSticky ? "auto" : "none",
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

  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: headerHeight,
      paddingBottom: insets.bottom + 20,
      flexGrow: 1,
      minHeight: minimumContentHeight,
    }),
    [headerHeight, insets.bottom, minimumContentHeight],
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
        isOwnProfile={true}
       onBackPress={handleBackPress}
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
          onEndReachedThreshold={0.5}
          ListFooterComponent={ListFooterComponent}
          extraData={focusVersion}
          removeClippedSubviews={true}
          maxToRenderPerBatch={Platform.OS === "android" ? 7 : 9}
          windowSize={Platform.OS === "android" ? 11 : 13}
          initialNumToRender={5}
          updateCellsBatchingPeriod={Platform.OS === "android" ? 100 : 50}
          bounces={true}
          viewabilityConfig={profileViewabilityConfig}
          onViewableItemsChanged={onProfileViewableItemsChanged}
          onMomentumScrollEnd={handleProfileMomentumScrollEnd}
        />
      </GestureDetector>

      <ProfileOverlays
        postOptionsSheetRef={postOptionsSheetRef}
        reportSheetRef={reportSheetRef}
        selectedPost={selectedPost}
        isSaved={selectedPost ? savedPosts.some((p) => p.id === selectedPost.id) : false}
        deleteVisible={deleteHandler.showConfirmation}
        deleteType={deleteHandler.pendingTarget?.type}
        isDeleting={deleteHandler.isDeleting}
        blockVisible={blockHandler.showConfirmation}
        blockLabel={blockHandler.pendingBlock?.label}
        reportTargetType={reportHandler.pendingTarget?.type}
        isReporting={reportHandler.isReporting}
        onSave={() => {
          if (!selectedPost) return;
          const saved = useSavedPostsStore.getState().toggleSavePost(selectedPost);
          toast.success(
            saved ? "Post saved" : "Post unsaved",
            saved ? "You can find it in your saved items." : "Removed from saved items.",
          );
        }}
        onEdit={handleEditPost}
        onDelete={handleDeletePost}
        onBlockPost={handleBlockPost}
        onReport={handleReportPost}
        onDismissPostOptions={() => setSelectedPost(null)}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={deleteHandler.cancelDelete}
        onConfirmBlock={handleConfirmBlock}
        onCancelBlock={blockHandler.cancelBlock}
        onSubmitReport={handleReportSubmit}
        onDismissReport={reportHandler.cancelReport}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    flex: 1,
  },
  inlineTabPlaceholder: {
    height: PROFILE_TAB_BAR_HEIGHT,
    backgroundColor: theme.colors.background.default,
  },
  stickyTabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 99,
  },
  bottomSpacer: {
    height: 80,
  },
}));
