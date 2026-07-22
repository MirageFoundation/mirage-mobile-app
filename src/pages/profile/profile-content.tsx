import { usePostEditStore } from "@/src/stores/post-edit-store";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/src/navigation/guarded-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
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
  useInfiniteUserPosts,
  useProfile,
  useUserStatus,
} from "@/src/api/read";
import { getUserPosts } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import {
  USER_POSTS_MAX_PAGES,
  USER_POSTS_QUERY_GC_TIME,
} from "@/src/api/read/infinite-query-policy";
import { transformApiPost } from "@/src/api/read/utils";
import type { Post as ApiPost, PostsResponse } from "@/src/api/types";
import {
  getGradientColor,
  type Post,
  PROFILE_CONTENT_HEIGHT,
  ProfileHeaderBar,
  ProfileTabBar,
  ProfileEmptyState,
} from "@/src/components/molecules";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import { PostCardSkeletonList } from "@/src/components/molecules/post-card-skeleton";
import { ProfileCommentItem } from "@/src/components/molecules/profile-comment-item";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { ProfileContentAnimated } from "@/src/components/molecules/profile-content-animated";
import { Box } from "@/src/components/ui/primitives";
import { ProfileAboutTab } from "./profile-about-tab";
import {
  useTabSwipeGesture,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  getShareBaseUrl,
  useFeedScrollStore,
} from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useEdit } from "@/src/api/write";
import { composeCommentContent, resolveCommentMediaUrl } from "@/src/utils/comment-media";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";
import {
  usePowQueueStore,
  generateActionId,
  getActionLabel,
} from "@/src/services/pow-queue";
import {
  ProfilePostActionSheets,
  type ProfilePostActionSheetsRef,
} from "./profile-post-action-sheets";
import { styles } from "./profile-styles";
import { useProfileFeedVideoState } from "./use-profile-feed-video-state";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList<Post | ApiPost | "header" | "tabs">,
);

const HEADER_BAR_HEIGHT = 56;
const PROFILE_POSTS_FEED_CONTEXT = "profile:self:posts";

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
const MemoizedPostCardItem = memo(PostCardItem, (prev, next) => {
 const p = prev.post;
 const n = next.post;
 if (p.id !== n.id) return false;
 if (p.title !== n.title) return false;
 if (p.body !== n.body) return false;
 if (p.likes !== n.likes) return false;
 if (p.dislikes !== n.dislikes) return false;
 if (p.comments !== n.comments) return false;
 if (p.hasLiked !== n.hasLiked) return false;
 if (p.hasDisliked !== n.hasDisliked) return false;
 if (p.awards?.length !== n.awards?.length) return false;
 if (prev.isVisible !== next.isVisible) return false;
 if (prev.isFocused !== next.isFocused) return false;
 if (prev.isNearVisible !== next.isNearVisible) return false;
 if (prev.screenActive !== next.screenActive) return false;
 return true;
});
const MemoizedProfileCommentItem = memo(ProfileCommentItem, (prev, next) => {
 return prev.comment.post_id === next.comment.post_id
  && prev.comment.content === next.comment.content
  && prev.comment.points === next.comment.points;
});

const AnimatedPostWrapper = memo(function AnimatedPostWrapper({
 post,
 isVisible,
 isFocused,
 isNearVisible,
 screenActive,
  shareUrl,
 onPostPress,
 onAuthorPress,
 onCommentPress,
 onMorePress,
  onLikePress,
  onDislikePress,
  onTopicPress,
  videoSyncScope,
}: {
 post: Post;
 isVisible?: boolean;
 isFocused?: boolean;
 isNearVisible?: boolean;
 screenActive?: boolean;
  shareUrl?: string;
 onPostPress: (postId: string) => void;
 onAuthorPress: (authorId: string) => void;
 onCommentPress: (postId: string) => void;
 onMorePress: (postId: string) => void;
  onLikePress: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  onDislikePress: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  onTopicPress: (topic: string) => void;
  videoSyncScope?: string;
}) {
 const editOverride = usePostEditStore((s) => s.overrides[post.id]);
 const displayPost = editOverride ? {
   ...post,
   title: editOverride.title,
   body: editOverride.content || undefined,
   topic: editOverride.topic ?? post.topic,
   media: editOverride.media
     ? editOverride.media.map((url: string) => ({ uri: url, type: "image" as const }))
     : post.media,
 } : post;
 return (
   <MemoizedPostCardItem
    post={displayPost}
    isOwnPost={true}
    isVisible={isVisible}
    isFocused={isFocused}
    isNearVisible={isNearVisible}
   screenActive={screenActive}
    showUrlCard={false}
    videoSyncScope={videoSyncScope}
     shareUrl={shareUrl}
    onPostPress={onPostPress}
    onAuthorPress={onAuthorPress}
    onCommentPress={onCommentPress}
    onMorePress={onMorePress}
    onLikePress={onLikePress}
    onDislikePress={onDislikePress}
   onTopicPress={onTopicPress}
   />
 );
});

const MemoizedCommentWrapper = memo(function MemoizedCommentWrapper({
 comment,
 onPress,
}: {
 comment: ApiPost;
 onPress: (commentId: string, rootPostId: string) => void;
}) {
 return (
   <MemoizedProfileCommentItem
    comment={comment}
    onPress={onPress}
   />
 );
});

export function ProfileScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const user = useAuthStore((s) => s.user);
  const storedUserLevel = useAuthStore((s) => s.userLevel);
  const setUserLevel = useAuthStore((s) => s.setUserLevel);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();

  const { registerProfileRefresh, showBars } =
    useScrollAnimationContext();

  const flatListRef = useRef<FlatList<any>>(null);
  const setFeedScrolling = useCallback((isScrolling: boolean) => {
    useFeedScrollStore.getState().setContextScrolling(PROFILE_POSTS_FEED_CONTEXT, isScrolling);
  }, []);

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

  const postActionSheetsRef = useRef<ProfilePostActionSheetsRef>(null);
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
      queryKey: queryKeys.userPosts(
        user.walletAddress,
        "comments",
        undefined,
        user.walletAddress,
      ),
      queryFn: ({ pageParam = 1 }) =>
        getUserPosts({
          owner: user.walletAddress,
          address: user.walletAddress,
          page: pageParam,
          type: "comments",
          limit: 20,
        }),
      initialPageParam: 1,
      getNextPageParam: (lastPage: PostsResponse) => {
        if (!lastPage?.has_more) return undefined;
        return lastPage.page + 1;
      },
      maxPages: USER_POSTS_MAX_PAGES,
      gcTime: USER_POSTS_QUERY_GC_TIME,
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
  }, [postsData, getTabType, hiddenPostIds, hiddenCommentIds, commentEditOverrides, focusVersion]);

  const uiPosts = useMemo(
    () => apiPosts.map((post) => transformApiPost(post, {
      currentUser: user ? { id: user.id, username: user.username } : undefined,
    })),
    [apiPosts, user],
  );

const listData = useMemo((): Array<Post | ApiPost | "header" | "tabs"> => {
   if (activeTab === 2) {
      return ["header", "tabs"];
   }
    const posts = activeTab === 0 ? uiPosts : apiPosts;
    return ["header", "tabs", ...posts];
  }, [activeTab, uiPosts, apiPosts]);

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
            queryKey: queryKeys.userPostsForOwner(user.walletAddress),
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
          queryKey: queryKeys.userPostsForOwner(user.walletAddress),
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
    const currentUserLevel = userStatus?.user_level ?? 0;
    if (currentUserLevel > storedUserLevel && user?.walletAddress) {
      setUserLevel(currentUserLevel, user.walletAddress);
    }
    router.push("/change-username");
  }, [router, setUserLevel, storedUserLevel, user?.walletAddress, userStatus?.user_level]);

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

   const optimisticContent = composeCommentContent(text, imageUri || gifUrl || null);

      setCommentEditOverrides((prev) => ({ ...prev, [commentId]: optimisticContent }));

      const actionId = generateActionId();
      enqueue({
        id: actionId,
        type: "edit",
        label: getActionLabel("edit"),
        execute: async () => {
          const mediaUrl = await resolveCommentMediaUrl(imageUri, gifUrl);
          const finalContent = composeCommentContent(text, mediaUrl);

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
        onError: (err) => {
          Sentry.captureException(err, {
            tags: { feature: "comment", operation: "edit_comment_profile" },
            extra: {
              commentId,
              parentId,
              hadImage: !!imageUri,
              hadGif: !!gifUrl,
              contentLength: text.length,
            },
          });
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

  const handlePostMorePress = useCallback(
    (postId: string) => {
      const post = postsById.get(postId);
      if (post) {
        postActionSheetsRef.current?.openPost(post);
      }
    },
    [postsById],
  );

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
            queryKey: queryKeys.userPostsForOwner(user.walletAddress),
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

  const {
    activeVideoPostId,
    visibleVideoPostIds,
    nearbyVideoPostIds,
    profileViewabilityConfig,
    onProfileViewableItemsChanged,
    handleProfileMomentumScrollEnd,
  } = useProfileFeedVideoState({ activeTab, listData });

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
      ({ item }: { item: Post | ApiPost | "header" | "tabs" }) => {
        if (item === "header") {
         return (
           <ProfileContentAnimated
             username={username}
             avatarSeed={user?.walletAddress || username}
             avatarUrl={avatarUrl}
            walletAddress={user?.walletAddress || "0x0000...0000"}
            balance={profileData.balance}
             reserve={profileData.reserve}
             accountAgeDays={profileData.accountAgeDays}
             gradientColors={gradientColors}
             scrollY={scrollY}
             onFollowersPress={handleFollowersPress}
             onEditUsernamePress={handleEditUsernamePress}
             isLoading={isLoading}
            headerHeight={headerHeight}
            userLevel={userStatus?.user_level ?? 0}
           />
         );
        }

        if (item === "tabs") {
          if (isTabsSticky) {
            return <View style={styles.inlineTabPlaceholder} />;
          }

          return (
            <View>
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
          const cleanPost = postsWithoutWarnings.get(item.id) || item;
          return (
            <Animated.View style={contentAnimatedStyle}>
              <AnimatedPostWrapper
               post={cleanPost}
               isVisible={visibleVideoPostIds.has(item.id)}
               isFocused={activeVideoPostId === item.id}
               isNearVisible={nearbyVideoPostIds.has(item.id)}
               screenActive={isFocused}
               videoSyncScope={PROFILE_POSTS_FEED_CONTEXT}
               shareUrl={`${getShareBaseUrl(shareServer)}/p/${item.id}`}
               onPostPress={handlePostPress}
               onAuthorPress={handleAuthorPress}
               onCommentPress={handlePostPress}
               onMorePress={handlePostMorePress}
               onLikePress={handleUpvote}
               onDislikePress={handleDownvote}
               onTopicPress={handleTopicPress}
              />
            </Animated.View>
          );
        }

       if (activeTab === 1 && "post_id" in item) {
         return (
           <Animated.View style={contentAnimatedStyle}>
             <MemoizedCommentWrapper
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
        handlePostPress,
        handleAuthorPress,
        handlePostMorePress,
       handleCommentPress,
      handleUpvote,
      handleDownvote,
      contentAnimatedStyle,
      animatedTabIndex,
      postsWithoutWarnings,
      activeVideoPostId,
      isFocused,
      shareServer,
      ],
    );

 const listFooter = useMemo(() => {
    if (activeTab === 2) {
      return (
          <Animated.View style={contentAnimatedStyle}>
            <ProfileAboutTab
              userAddress={user?.walletAddress}
              isOwnProfile={true}
              onBlockedPress={handleBlockedPress}
            />
          </Animated.View>
      );
    }

    if (isLoadingPosts) {
      return activeTab === 0 ? (
            <Animated.View style={contentAnimatedStyle}>
              <PostCardSkeletonList count={3} />
            </Animated.View>
          ) : (
            <Animated.View style={contentAnimatedStyle}>
              <ProfilePostsSkeleton count={5} type="comments" />
            </Animated.View>
          );
    }

    if (listData.length <= 2) {
      const tabType = activeTab === 0 ? "posts" : "comments";
      return (
          <Animated.View style={contentAnimatedStyle}>
            <ProfileEmptyState
              tabType={tabType}
              onSettingsPress={handleSettingsPress}
              isOwnProfile={true}
            />
          </Animated.View>
      );
    }

    if (isFetchingNextPage) {
      return activeTab === 0 ? (
            <Animated.View style={contentAnimatedStyle}>
              <PostCardSkeletonList count={1} />
            </Animated.View>
          ) : (
            <Animated.View style={contentAnimatedStyle}>
              <ProfilePostsSkeleton count={2} type="comments" />
            </Animated.View>
          );
    }

    return (
      <Animated.View style={contentAnimatedStyle}>
        <View style={styles.bottomSpacer} />
      </Animated.View>
    );
  }, [
    activeTab,
    isLoadingPosts,
    isFetchingNextPage,
    listData.length,
    handleSettingsPress,
    user?.walletAddress,
    handleBlockedPress,
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
          onEndReachedThreshold={0.5}
          ListFooterComponent={listFooter}
          extraData={focusVersion}
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
        />
      </GestureDetector>

      <ProfilePostActionSheets ref={postActionSheetsRef} isOwnPost />
    </Box>
  );
}
