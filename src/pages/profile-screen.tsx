import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
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
  useInfiniteUserPosts,
  useProfile,
  useUserStatus,
} from "@/src/api/read";
import { transformApiPost } from "@/src/api/read/utils";
import type { Post as ApiPost } from "@/src/api/types";
import {
  ConfirmationPopup,
  getGradientColor,
  type Post,
  PostOptionsSheet,
  PostOptionsSheetRef,
  PROFILE_CONTENT_HEIGHT,
  ProfileHeaderBar,
  ProfileMenuSheet,
  ProfileMenuSheetRef,
  ProfileTabBar,
  ProfileEmptyState,
  ReportSheet,
  ReportSheetRef,
  ProfileAboutTab,
} from "@/src/components/molecules";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import { PostCardSkeletonList } from "@/src/components/molecules/post-card-skeleton";
import { ProfileCommentItem } from "@/src/components/molecules/profile-comment-item";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { ProfileContentAnimated } from "@/src/components/molecules/profile-content-animated";
import { Box } from "@/src/components/ui/primitives";
import {
  useBlockHandler,
  useDeleteHandler,
  useReportHandler,
  useTabSwipeGesture,
} from "@/src/hooks";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  getShareBaseUrl,
  useSavedPostsStore,
} from "@/src/stores";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useEdit } from "@/src/api/write";
import { useToast } from "@/src/providers/toast-provider";
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

type TabType = "posts" | "comments" | "about";

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
 onPostPress,
 onAuthorPress,
 onCommentPress,
 onMorePress,
}: {
 post: Post;
 contentAnimatedStyle: any;
 onPostPress: (postId: string) => void;
 onAuthorPress: (authorId: string) => void;
 onCommentPress: (postId: string) => void;
 onMorePress: (postId: string) => void;
}) {
 return (
  <Animated.View style={contentAnimatedStyle}>
   <MemoizedPostCardItem
    post={post}
    isOwnPost={true}
    showUrlCard={false}
    onPostPress={onPostPress}
    onAuthorPress={onAuthorPress}
    onCommentPress={onCommentPress}
    onMorePress={onMorePress}
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

export function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();

  const { registerProfileRefresh } =
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

  const menuSheetRef = useRef<ProfileMenuSheetRef>(null);
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

 const apiPosts = useMemo(() => {
   const allPosts = postsData?.pages.flatMap((page) => page.posts) ?? [];
   if (getTabType() === "submissions") {
     return allPosts.filter((post) => !hiddenPostIds.has(post.post_id));
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
  ]);

  useFocusEffect(
    useCallback(() => {
      if (user?.walletAddress) {
        refetchUserStatus();
        refetchProfile();
        queryClient.invalidateQueries({
          queryKey: ["user", "posts", user.walletAddress],
        });
      }
    }, [queryClient, user?.walletAddress, refetchUserStatus, refetchProfile]),
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

  const handleSharePress = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out @${user?.username} on Mirage!`,
        url: `${getShareBaseUrl(shareServer)}/u/${user?.username}`,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  }, [user?.username, shareServer]);

  const handleMenuPress = useCallback(() => {
    menuSheetRef.current?.present();
  }, []);

  const handleMenuSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleMenuSubscription = useCallback(() => {
    router.push("/subscription");
  }, [router]);

  const handleMenuNetwork = useCallback(() => {
    console.log("Network pressed");
  }, []);

  const handleMenuInviteAndEarn = useCallback(() => {
    router.push("/invite-and-earn");
  }, [router]);

  const handleMenuHistory = useCallback(() => {
    router.push("/history");
  }, [router]);

  const handleMenuSaved = useCallback(() => {
    router.push("/saved-posts");
  }, [router]);

  const handleOnlineStatusChange = useCallback((isOnline: boolean) => {
    console.log("Online status changed:", isOnline);
  }, []);

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

  const handleEditCommentPress = useCallback(
    (comment: ApiPost, rootPostId: string) => {
      const params: Record<string, string> = {
        postId: rootPostId,
        postTitle: "",
        postAuthorUsername: "",
        editCommentId: comment.post_id,
        editParentId: comment.root_post_id || rootPostId,
        editContent: comment.content,
      };
      router.push({ pathname: "/comment-compose", params });
    },
    [router],
  );

  const handleDeleteCommentPress = useCallback(
    (comment: ApiPost) => {
      deleteHandler.requestDelete(comment.post_id, "comment");
    },
    [deleteHandler],
  );

useEffect(() => {
  if (pendingEdit) {
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
    [postsById],
  );

  const handleDeletePost = useCallback(() => {
    if (!selectedPost) return;
    deleteHandler.requestDelete(selectedPost.id, "post");
  }, [selectedPost, deleteHandler]);

  const handleBlockPost = useCallback(() => {
    if (!selectedPost) return;
    blockHandler.requestBlockPost(selectedPost.id);
  }, [selectedPost, blockHandler]);

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
    [reportHandler, globalHidePost],
  );

  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

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
        await Promise.all([refetchUserStatus(), refetchProfile()]);
        if (user?.walletAddress) {
          const type = index === 0 ? "submissions" : "comments";
          queryClient.invalidateQueries({
            queryKey: ["user", "posts", user.walletAddress, type],
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [refetchUserStatus, refetchProfile, queryClient, user?.walletAddress],
  );

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
           />
         );
        }

        if (item === "tabs") {
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
            <AnimatedPostWrapper
             post={cleanPost}
             contentAnimatedStyle={contentAnimatedStyle}
             onPostPress={handlePostPress}
             onAuthorPress={handleAuthorPress}
             onCommentPress={handlePostPress}
             onMorePress={handlePostMorePress}
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
      user?.walletAddress,
      avatarUrl,
      profileData,
       gradientColors,
       scrollY,
       handleFollowersPress,
       handleEditUsernamePress,
        isLoading,
       headerHeight,
        activeTab,
        handleTabChange,
        handleTabDoubleTap,
        handlePostPress,
        handleAuthorPress,
        handlePostMorePress,
       handleCommentPress,
      animatedTabIndex,
      contentAnimatedStyle,
      postsWithoutWarnings,
      ],
    );

 const ListFooterComponent = useCallback(() => {
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
            isOwnProfile={true}
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
    user?.walletAddress,
    handleBlockedPress,
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
    [headerHeight, insets.bottom],
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
       onMenuPress={handleMenuPress}
       onSubscriptionPress={handleMenuSubscription}
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
          onEndReachedThreshold={0.5}
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

      <ProfileMenuSheet
        ref={menuSheetRef}
        isOnline={true}
        onSettings={handleMenuSettings}
        onSubscription={handleMenuSubscription}
        onNetwork={handleMenuNetwork}
        onInviteAndEarn={handleMenuInviteAndEarn}
        onHistory={handleMenuHistory}
        onSaved={handleMenuSaved}
        onOnlineStatusChange={handleOnlineStatusChange}
      />

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={true}
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
        title={
          deleteHandler.pendingTarget?.type === "comment"
            ? "Delete Comment?"
            : "Delete Post?"
        }
        message="This action cannot be undone."
        description={
          deleteHandler.pendingTarget?.type === "comment"
            ? "The comment will be permanently removed."
            : "The post will be permanently removed."
        }
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

      <ReportSheet
        ref={reportSheetRef}
        targetType={reportHandler.pendingTarget?.type}
        onSubmit={handleReportSubmit}
        onDismiss={reportHandler.cancelReport}
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
