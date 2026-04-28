import { navigateToEditPost } from "@/src/utils/edit-post";
import { markSeen } from "@/src/services/seen-posts";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import * as Sentry from "@sentry/react-native";
import * as Clipboard from "expo-clipboard";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/hooks/use-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ListRenderItem,
  Platform,
  Share,
  useWindowDimensions,
  View,
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
import type { Post as ApiPost } from "@/src/api/types";
import {
  useBlockUser,
  useUnblockUser,
} from "@/src/api/write";
import {
  ConfirmationPopup,
  getGradientColor,
  type Post,
  PostOptionsSheet,
  PostOptionsSheetRef,
  PROFILE_CONTENT_HEIGHT,
  ProfileHeaderBar,
  ProfileTabBar,
  ProfileEmptyState,
  ReportSheet,
  ReportSheetRef,
  UserProfileMenuSheet,
  UserProfileMenuSheetRef,
  ProfileAboutTab,
} from "@/src/components/molecules";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import { PostCardSkeletonList } from "@/src/components/molecules/post-card-skeleton";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { ProfileCommentItem } from "@/src/components/molecules/profile-comment-item";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { UserProfileContentAnimated } from "@/src/components/molecules/user-profile-content-animated";
import { PROFILE_TAB_BAR_HEIGHT } from "@/src/components/molecules/profile-tabs";
import { Box } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  useAppState,
  useBlockHandler,
  getBlockConfirmationMessage,
  useDeleteHandler,
  useFollowHandler,
  useReportHandler,
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
  useSavedPostsStore,
} from "@/src/stores";
import { useHomePostCardStore } from "@/src/pages/home/home-post-card-store";

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
 if (prev.contentRevealed !== next.contentRevealed) return false;
 return true;
});
const MemoizedProfileCommentItem = memo(ProfileCommentItem, (prev, next) => {
 return prev.comment.post_id === next.comment.post_id
  && prev.comment.content === next.comment.content
  && prev.comment.points === next.comment.points;
});

const PostWrapper = memo(function PostWrapper({
 post,
 isOwnProfile,
 isVisible,
 isFocused,
 isNearVisible,
 screenActive,
 contentRevealed,
 shareUrl,
 onPostPress,
 onAuthorPress,
 onCommentPress,
 onMorePress,
 onLikePress,
 onDislikePress,
 onBlockUser,
 onBlockPost,
 onReport,
 onRevealContent,
  onTopicPress,
  videoSyncScope,
}: {
 post: Post;
 isOwnProfile: boolean;
 isVisible?: boolean;
 isFocused?: boolean;
 isNearVisible?: boolean;
 screenActive?: boolean;
 contentRevealed?: boolean;
 shareUrl: string;
 onPostPress: (postId: string) => void;
 onAuthorPress: (authorId: string) => void;
 onCommentPress: (postId: string) => void;
 onMorePress: (postId: string) => void;
 onLikePress: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
 onDislikePress: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
 onBlockUser: (postId: string, authorId: string, authorUsername: string) => void;
 onBlockPost: (postId: string) => void;
 onReport: (postId: string) => void;
 onRevealContent?: (postId: string) => void;
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
    isOwnPost={isOwnProfile}
    isVisible={isVisible}
    isFocused={isFocused}
    isNearVisible={isNearVisible}
    screenActive={screenActive}
    contentRevealed={contentRevealed}
    showUrlCard={false}
    videoSyncScope={videoSyncScope}
    showFollowButton={false}
    shareUrl={shareUrl}
    onPostPress={onPostPress}
    onAuthorPress={onAuthorPress}
    onCommentPress={onCommentPress}
    onMorePress={onMorePress}
    onLikePress={onLikePress}
    onDislikePress={onDislikePress}
    onBlockUser={onBlockUser}
    onBlockPost={onBlockPost}
    onReport={onReport}
    onRevealContent={onRevealContent}
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

export function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const toast = useToast();

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

  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const userMenuSheetRef = useRef<UserProfileMenuSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showReportUserSheet, setShowReportUserSheet] = useState(false);

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
  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalUnhidePost = useContentModerationStore((s) => s.unhidePost);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);
  const globalUnhideComment = useContentModerationStore(
    (s) => s.unhideComment
  );
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
      queryKey: queryKeys.userPosts(userAddress, "comments"),
      queryFn: ({ pageParam = 1 }) =>
        getUserPosts({
          owner: userAddress,
          address: currentUser?.walletAddress ?? undefined,
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

  const handleSharePress = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out @${username} on Mirage!`,
        url: `${getShareBaseUrl(shareServer)}/u/${username}`,
      });
    } catch (error) {
      Sentry.addBreadcrumb({ category: "user-profile", message: "Share failed", data: { error: String(error) }, level: "warning" });
    }
  }, [username, shareServer]);

  const handleMenuPress = useCallback(() => {
    if (!isOwnProfile) {
      userMenuSheetRef.current?.present();
    }
  }, [isOwnProfile]);

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
    setShowReportUserSheet(true);
    reportSheetRef.current?.present();
  }, []);

  const handleCopyProfileLink = useCallback(async () => {
    const profileUrl = `${getShareBaseUrl(shareServer)}/u/${username}`;
    await Clipboard.setStringAsync(profileUrl);
    triggerHaptic("success");
    toast.success("Profile link copied");
  }, [shareServer, username, toast]);

  const handleReportUserSubmit = useCallback(
    (reason: string) => {
      if (!userAddress) return;
      const loadingId = toast.loading("Submitting report...");
      reportSheetRef.current?.dismiss();
      setShowReportUserSheet(false);
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
        setSelectedPost(post);
        postOptionsSheetRef.current?.present();
      }
    },
    [postsById]
  );

  const handleEditPost = useCallback(() => {
    if (!selectedPost) return;
    navigateToEditPost(router, selectedPost);
  }, [selectedPost, router]);

  const handleDeletePost = useCallback(() => {
    if (!selectedPost) return;
    deleteHandler.requestDelete(selectedPost.id, "post");
  }, [selectedPost, deleteHandler]);

  const handleBlockPost = useCallback(() => {
    if (!selectedPost) return;
    blockHandler.requestBlockPost(selectedPost.id);
  }, [selectedPost, blockHandler]);

  const handleBlockUserFromCard = useCallback(
    (postId: string, authorId: string, authorUsername: string) => {
      blockHandler.requestBlockUser(authorId, authorUsername);
    },
    [blockHandler]
  );

  const handleBlockPostFromCard = useCallback(
    (postId: string) => {
      blockHandler.requestBlockPost(postId);
    },
    [blockHandler]
  );

  const handleReportFromCard = useCallback(
    (postId: string) => {
      reportHandler.requestReport(postId, "post");
    },
    [reportHandler]
  );

  const handleReportPost = useCallback(() => {
    if (!selectedPost) return;
    reportHandler.requestReport(selectedPost.id, "post");
  }, [selectedPost, reportHandler]);

  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending) {
      if (pending.type === "post") {
        globalHidePost(pending.id);
      } else {
        globalHideComment(pending.id);
      }
    }
    setSelectedPost(null);
    deleteHandler.confirmDelete();
  }, [deleteHandler, globalHidePost, globalHideComment]);

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending && pending.type === "topic") {
      blockTopicOptimistic(pending.id);
    } else if (pending && pending.type === "post") {
      globalHidePost(pending.id);
    }
    setSelectedPost(null);
    blockHandler.confirmBlock();
  }, [blockHandler, globalHidePost, blockTopicOptimistic]);

  const handleReportSubmit = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending && pending.type === "post") {
        globalHidePost(pending.id);
      }
      setSelectedPost(null);
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [reportHandler, globalHidePost]
  );

  useEffect(() => {
    if (reportHandler.showReportSheet && !showReportUserSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet, showReportUserSheet]);

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
          const type = index === 0 ? "submissions" : "comments";
          queryClient.invalidateQueries({
            queryKey: ["user", "posts", userAddress, type],
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

  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [visibleVideoPostIds, setVisibleVideoPostIds] = useState<Set<string>>(new Set());
  const [nearbyVideoPostIds, setNearbyVideoPostIds] = useState<Set<string>>(new Set());
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
      setActiveVideoPostId(postId);
      setVisibleVideoPostIds((prev) => {
        const next = new Set(prev);
        next.add(postId);
        return next;
      });
    }
  }, [uiPosts]);

  const profileViewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
    minimumViewTime: 300,
  }).current;

  const pendingProfileViewableRef = useRef<ViewToken[] | null>(null);
  const profileDeferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listDataRef = useRef(listData);
  listDataRef.current = listData;

  const flushProfileViewability = () => {
    const items = pendingProfileViewableRef.current;
    if (!items) return;
    const visibleItems = items.filter(
      (item) => item.isViewable && item.item && typeof item.item === "object" && "id" in item.item
    );
    if (visibleItems.length === 0) {
      setVisibleVideoPostIds(new Set());
      setNearbyVideoPostIds(new Set());
      setActiveVideoPostId(null);
      return;
    }
    const videoItems = visibleItems.filter(
      (item) => postHasPlayableVideo(item.item)
    );
    const newVisibleIds = new Set(videoItems.map((item) => item.item.id));
    setVisibleVideoPostIds(newVisibleIds);

    const nearbyIds = new Set(newVisibleIds);
    const allData = listDataRef.current;
    if (allData.length > 0 && visibleItems.length > 0) {
      const indices = visibleItems.map((v) => v.index ?? 0);
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);
      const lo = Math.max(0, minIdx - 3);
      const hi = Math.min(allData.length - 1, maxIdx + 3);
      for (let i = lo; i <= hi; i++) {
        const p = allData[i];
        if (p && typeof p === "object" && "id" in p && postHasPlayableVideo(p)) nearbyIds.add(p.id);
      }
    }
    setNearbyVideoPostIds(nearbyIds);

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
      setNearbyVideoPostIds(new Set());
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
            <PostWrapper
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
    if (isBlocked) {
      const tabType = activeTab === 0 ? "posts" : activeTab === 1 ? "comments" : "about";
      return (
          <Animated.View style={contentAnimatedStyle}>
            <ProfileEmptyState
              tabType={tabType}
              isOwnProfile={false}
              isBlocked={true}
              onUnblock={handleUnblockUser}
            />
          </Animated.View>
      );
   }

    if (activeTab === 2) {
      return (
          <Animated.View style={contentAnimatedStyle}>
            <ProfileAboutTab
              userAddress={userAddress}
              isOwnProfile={isOwnProfile}
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
              isOwnProfile={isOwnProfile}
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
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          onBlock={handleRequestBlockUser}
          onUnblock={handleUnblockUser}
          onReport={handleReportUser}
          onCopyProfileLink={handleCopyProfileLink}
        />
      )}

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={isOwnProfile}
        isSaved={selectedPost ? savedPosts.some((p) => p.id === selectedPost.id) : false}
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
        onDismiss={() => setSelectedPost(null)}
      />

      <ConfirmationPopup
        visible={deleteHandler.showConfirmation}
        title="Delete Post?"
        message="This action cannot be undone."
        description="The post will be permanently removed."
        icon="trash-outline"
        isDestructive
        isLoading={deleteHandler.isDeleting}
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={deleteHandler.cancelDelete}
      />

      <ConfirmationPopup
        visible={blockHandler.showConfirmation}
        title={`Block ${blockHandler.pendingBlock?.label || "this post"}?`}
        message={getBlockConfirmationMessage(
          blockHandler.pendingBlock?.type ?? "post",
        )}
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={handleConfirmBlock}
        onCancel={blockHandler.cancelBlock}
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
        targetType={
          showReportUserSheet ? "post" : reportHandler.pendingTarget?.type
        }
        onSubmit={
          showReportUserSheet ? handleReportUserSubmit : handleReportSubmit
        }
        onDismiss={() => {
          if (showReportUserSheet) {
            setShowReportUserSheet(false);
          } else {
            reportHandler.cancelReport();
          }
        }}
        isLoading={reportHandler.isReporting}
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
