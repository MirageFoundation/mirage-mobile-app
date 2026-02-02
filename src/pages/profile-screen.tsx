import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ListRenderItem,
  Share,
  View,
  ViewToken,
} from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
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
} from "@/src/hooks";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  getShareBaseUrl,
} from "@/src/stores";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useEdit } from "@/src/api/write";
import type { PoWProgress } from "@/src/api/write/signing";
import { useToast } from "@/src/providers/toast-provider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList<Post | ApiPost | "header" | "tabs">,
);

const HEADER_BAR_HEIGHT = 56;
const TAB_BAR_INDEX = 1;

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

const MemoizedPostCardItem = memo(PostCardItem);
const MemoizedProfileCommentItem = memo(ProfileCommentItem);

export function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();

  const { registerProfileScrollRef, registerProfileRefreshCallback } =
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

  useEffect(() => {
    registerProfileScrollRef(flatListRef.current);
  }, [registerProfileScrollRef]);

  const scrollY = useSharedValue(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const menuSheetRef = useRef<ProfileMenuSheetRef>(null);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

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

  const editToastIdRef = useRef<string | null>(null);
  const handleEditPoWProgress = useCallback(
    (progress: PoWProgress) => {
      const tid = editToastIdRef.current;
      if (tid) {
        const pct =
          progress.estimatedTotalMs > 0
            ? Math.min(99, Math.round((progress.elapsedMs / progress.estimatedTotalMs) * 100))
            : 0;
        toast.update(tid, { description: `Computing proof of work... ${pct}%` });
      }
    },
    [toast],
  );

 const editMutation = useEdit({ onPoWProgress: handleEditPoWProgress });

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
    () => apiPosts.map((post) => transformApiPost(post)),
    [apiPosts],
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
    registerProfileRefreshCallback(handleRefresh);
  }, [
    registerProfileRefreshCallback,
    refetchUserStatus,
    refetchProfile,
    refetchPosts,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (user?.walletAddress) {
        queryClient.invalidateQueries({
          queryKey: ["user", "posts", user.walletAddress],
        });
      }
    }, [queryClient, user?.walletAddress]),
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

  const handleMenuDrafts = useCallback(() => {
    console.log("Drafts pressed");
  }, []);

  const handleMenuHistory = useCallback(() => {
    console.log("History pressed");
  }, []);

  const handleMenuSaved = useCallback(() => {
    console.log("Saved pressed");
  }, []);

  const handleOnlineStatusChange = useCallback((isOnline: boolean) => {
    console.log("Online status changed:", isOnline);
  }, []);

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
      finalContent = text.trim() ? `${text.trim()}\n\n${imageUri}` : imageUri;
    } else if (gifUrl) {
      finalContent = text.trim() ? `${text.trim()}\n\n${gifUrl}` : gifUrl;
    }

      setCommentEditOverrides((prev) => ({ ...prev, [commentId]: finalContent }));

     toast.dismissAll();
      const toastId = toast.loading("Editing comment", "Computing proof of work...");
      editToastIdRef.current = toastId;

     (async () => {
       try {
         await editMutation.mutateAsync({
           postId: commentId,
           parentId,
           title: "",
           content: finalContent,
           tag: "",
         });

         toast.update(toastId, {
           type: "success",
           title: "Comment edited!",
           description: undefined,
           duration: 3000,
         });
       setTimeout(() => toast.dismiss(toastId), 3000);

        await refetchPosts();
        setCommentEditOverrides((prev) => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });
      } catch (error: unknown) {
          setCommentEditOverrides((prev) => {
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        const errorMessage =
           error instanceof Error ? error.message : "Failed to edit comment";
         toast.update(toastId, {
           type: "error",
           title: "Failed to edit comment",
           description: errorMessage,
           duration: 5000,
         });
         setTimeout(() => toast.dismiss(toastId), 5000);
       } finally {
          editToastIdRef.current = null;
       }
     })();
   }
 }, [pendingEdit, clearPendingEdit, editMutation, toast, refetchPosts]);

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

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

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
    (item: Post | ApiPost | "header" | "tabs", index: number) => {
      if (item === "header") return "header";
      if (item === "tabs") return "tabs";
      return "id" in item ? item.id : item.post_id;
    },
    [],
  );

  const renderItem: ListRenderItem<Post | ApiPost | "header" | "tabs"> =
    useCallback(
      ({ item, index }) => {
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
             isLoading={isLoading}
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
              />
            </View>
          );
        }

        if (activeTab === 0 && "id" in item) {
          const postWithoutWarnings = {
            ...item,
            contentWarnings: undefined,
          };
          return (
            <MemoizedPostCardItem
              post={postWithoutWarnings}
              isOwnPost={true}
              showUrlCard={false}
              onPostPress={handlePostPress}
              onAuthorPress={handleAuthorPress}
              onCommentPress={handlePostPress}
              onMorePress={handlePostMorePress}
            />
          );
        }

       if (activeTab === 1 && "post_id" in item) {
         return (
           <MemoizedProfileCommentItem
             comment={item}
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
        isLoading,
        theme.colors.background.default,
        activeTab,
        handleTabChange,
        handleTabDoubleTap,
        handlePostPress,
        handleAuthorPress,
        handlePostMorePress,
       handleCommentPress,
      ],
    );

 const ListFooterComponent = useCallback(() => {
    if (activeTab === 2) {
      return (
        <ProfileAboutTab
          userAddress={user?.walletAddress}
          isOwnProfile={true}
          onBlockedPress={handleBlockedPress}
        />
      );
    }

    if (isLoadingPosts) {
      return activeTab === 0 ? (
        <PostCardSkeletonList count={3} />
      ) : (
        <ProfilePostsSkeleton count={5} type="comments" />
      );
    }

    if (listData.length <= 2) {
      const tabType = activeTab === 0 ? "posts" : "comments";
      return (
        <ProfileEmptyState
          tabType={tabType}
          onSettingsPress={handleSettingsPress}
          isOwnProfile={true}
        />
      );
    }

    if (isFetchingNextPage) {
      return activeTab === 0 ? (
        <PostCardSkeletonList count={1} />
      ) : (
        <ProfilePostsSkeleton count={2} type="comments" />
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
  ]);

  const stickyTabsAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [stickyThreshold - 20, stickyThreshold],
      [0, 1],
      "clamp",
    );
    return { opacity };
  });

  const contentContainerStyle = useMemo(
    () => ({
      paddingTop: headerHeight,
      paddingBottom: insets.bottom + 20,
      flexGrow: 1,
    }),
    [headerHeight, insets.bottom],
  );

  const stickyHeaderIndices = useMemo(() => [TAB_BAR_INDEX], []);

  return (
    <Box flex background="base">
      <ProfileHeaderBar
        username={username}
        userLevel={userStatus?.user_level ?? 0}
        gradientColors={gradientColors}
        scrollY={scrollY}
        isRefreshing={isRefreshing}
        isLoading={isLoading}
        onBackPress={handleBackPress}
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
        pointerEvents={scrollY.value >= stickyThreshold ? "auto" : "none"}
      >
        <ProfileTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onTabDoubleTap={handleTabDoubleTap}
          tabWidth={SCREEN_WIDTH}
        />
      </Animated.View>

      <AnimatedFlatList
        ref={flatListRef as any}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        stickyHeaderIndices={stickyHeaderIndices}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={ListFooterComponent}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={5}
        updateCellsBatchingPeriod={50}
        bounces={true}
      />

      <ProfileMenuSheet
        ref={menuSheetRef}
        isOnline={true}
        onSettings={handleMenuSettings}
        onSubscription={handleMenuSubscription}
        onNetwork={handleMenuNetwork}
        onInviteAndEarn={handleMenuInviteAndEarn}
        onDrafts={handleMenuDrafts}
        onHistory={handleMenuHistory}
        onSaved={handleMenuSaved}
        onOnlineStatusChange={handleOnlineStatusChange}
      />

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={true}
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
