import * as Clipboard from "expo-clipboard";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ListRenderItem,
  Share,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
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
import { ProfileCommentItem } from "@/src/components/molecules/profile-comment-item";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { UserProfileContentAnimated } from "@/src/components/molecules/user-profile-content-animated";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  useBlockHandler,
  useDeleteHandler,
  useFollowHandler,
  useReportHandler,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { useTabSwipeGesture } from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  getShareBaseUrl,
  useSavedPostsStore,
} from "@/src/stores";

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
 if (p.likes !== n.likes) return false;
 if (p.dislikes !== n.dislikes) return false;
 if (p.comments !== n.comments) return false;
 if (p.hasLiked !== n.hasLiked) return false;
 if (p.hasDisliked !== n.hasDisliked) return false;
 return true;
});
const MemoizedProfileCommentItem = memo(ProfileCommentItem, (prev, next) => {
 return prev.comment.post_id === next.comment.post_id
  && prev.comment.content === next.comment.content
  && prev.comment.points === next.comment.points;
});

const AnimatedPostWrapper = memo(function AnimatedPostWrapper({
 post,
 contentAnimatedStyle,
 isOwnProfile,
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
}: {
 post: Post;
 contentAnimatedStyle: any;
 isOwnProfile: boolean;
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
}) {
 return (
  <Animated.View style={contentAnimatedStyle}>
   <MemoizedPostCardItem
    post={post}
    isOwnPost={isOwnProfile}
    showUrlCard={false}
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
   />
  </Animated.View>
 );
});

const AnimatedCommentWrapper = memo(function AnimatedCommentWrapper({
 comment,
 contentAnimatedStyle,
 onPress,
}: {
 comment: ApiPost;
 contentAnimatedStyle: any;
 onPress: (commentId: string, rootPostId: string) => void;
}) {
 return (
  <Animated.View style={contentAnimatedStyle}>
   <MemoizedProfileCommentItem
    comment={comment}
    onPress={onPress}
   />
  </Animated.View>
 );
});

export function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  console.log('[UserProfileScreen] RENDER - v3 with refetchOnMount:false');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const toast = useToast();

  const currentUser = useAuthStore((s) => s.user);
  const flatListRef = useRef<FlatList<any>>(null);

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

  const [voteOverrides, setVoteOverrides] = useState<
    Map<string, { hasLiked: boolean; hasDisliked: boolean; likeDelta: number }>
  >(new Map());

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: (targetId: string, result: VoteResult) => {
      setVoteOverrides((prev) => {
        const next = new Map(prev);
        const existing = prev.get(targetId);
        next.set(targetId, {
          hasLiked: result.hasLiked,
          hasDisliked: result.hasDisliked,
          likeDelta: (existing?.likeDelta ?? 0) + result.likeDelta,
        });
        return next;
      });
    },
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

  const apiPosts = useMemo(() => {
    const allPosts = postsData?.pages.flatMap((page) => page.posts) ?? [];
    if (getTabType() === "submissions") {
      return allPosts.filter((post) => !hiddenPostIds.has(post.post_id));
    }
    return allPosts.filter((post) => !hiddenCommentIds.has(post.post_id));
  }, [postsData, getTabType, hiddenPostIds, hiddenCommentIds]);

  const uiPosts = useMemo(
    () => apiPosts.map((post) => transformApiPost(post)),
    [apiPosts]
  );

  const postsWithVotes = useMemo(() => {
    if (voteOverrides.size === 0) return uiPosts;
    return uiPosts.map((post) => {
      const override = voteOverrides.get(post.id);
      if (!override) return post;
      return {
        ...post,
        contentWarnings: undefined,
        likes: post.likes + override.likeDelta,
        hasLiked: override.hasLiked,
        hasDisliked: override.hasDisliked,
      };
    });
  }, [uiPosts, voteOverrides]);

 const listData = useMemo((): Array<Post | ApiPost | "header" | "tabs"> => {
    if (isBlocked || activeTab === 2) {
      return ["header", "tabs"];
    }
    const posts = activeTab === 0 ? postsWithVotes : apiPosts;
    return ["header", "tabs", ...posts];
  }, [activeTab, postsWithVotes, apiPosts, isBlocked]);

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
      console.error("Share error:", error);
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
    if (pending && pending.type === "post") {
      globalHidePost(pending.id);
    }
    setSelectedPost(null);
    blockHandler.confirmBlock();
  }, [blockHandler, globalHidePost]);

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
          <AnimatedPostWrapper
           post={item}
           contentAnimatedStyle={contentAnimatedStyle}
           isOwnProfile={isOwnProfile}
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
          />
         );
       }

        if (activeTab === 1 && "post_id" in item) {
          return (
            <AnimatedCommentWrapper
             comment={item}
             contentAnimatedStyle={contentAnimatedStyle}
             onPress={handleCommentPress}
            />
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
      animatedTabIndex,
      contentAnimatedStyle,
    ]
  );

  const ListFooterComponent = useCallback(() => {
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
      return (
        <Animated.View style={contentAnimatedStyle}>
          {activeTab === 0 ? (
            <PostCardSkeletonList count={3} />
          ) : (
            <ProfilePostsSkeleton count={5} type="comments" />
          )}
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
      return (
        <Animated.View style={contentAnimatedStyle}>
          {activeTab === 0 ? (
            <PostCardSkeletonList count={1} />
          ) : (
            <ProfilePostsSkeleton count={2} type="comments" />
          )}
        </Animated.View>
      );
    }

    return <View style={styles.bottomSpacer} />;
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

  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: headerHeight,
      paddingBottom: insets.bottom + 20,
      flexGrow: 1,
    }),
    [headerHeight, insets.bottom]
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
          ref={flatListRef as any}
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={contentContainerStyle}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={ListFooterComponent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          windowSize={5}
          initialNumToRender={7}
          updateCellsBatchingPeriod={100}
          bounces={true}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
        message="You won't see this content anymore."
        description="You can unblock later from settings."
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={handleConfirmBlock}
        onCancel={blockHandler.cancelBlock}
      />

      <ConfirmationPopup
        visible={showBlockUserConfirmation}
        title={`Block @${displayUsername || "user"}?`}
        message="You won't see their posts or comments."
        description="You can unblock them anytime from their profile."
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
