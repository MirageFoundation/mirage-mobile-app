import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, ScrollView, Share, View } from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useProfile, useUserStatus } from "@/src/api/read";
import {
  ConfirmationPopup,
  getGradientColor,
  type Post,
  PostOptionsSheet,
  PostOptionsSheetRef,
  PROFILE_CONTENT_HEIGHT,
  ProfileContent,
  ProfileHeaderBar,
  ProfileMenuSheet,
  ProfileMenuSheetRef,
  ProfileTabBar,
  ProfileTabContent,
  ReportSheet,
  ReportSheetRef,
} from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import {
  useBlockHandler,
  useDeleteHandler,
  useReportHandler,
} from "@/src/hooks";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import { useAuthStore, useContentModerationStore, usePreferencesStore, getShareBaseUrl } from "@/src/stores";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

export function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();

  const { registerProfileScrollRef, registerProfileRefreshCallback } =
    useScrollAnimationContext();

  const scrollViewRef = useRef<ScrollView>(null);

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
    registerProfileScrollRef(scrollViewRef.current);
  }, [registerProfileScrollRef]);

  useEffect(() => {
    const handleRefresh = async () => {
      setIsRefreshing(true);
      try {
        await Promise.all([refetchUserStatus(), refetchProfile()]);
        if (user?.walletAddress) {
          queryClient.invalidateQueries({
            queryKey: ["user", "posts", user.walletAddress],
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    };
    registerProfileRefreshCallback(handleRefresh);
  }, [
    registerProfileRefreshCallback,
    refetchUserStatus,
    refetchProfile,
    queryClient,
    user?.walletAddress,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (user?.walletAddress) {
        queryClient.invalidateQueries({
          queryKey: ["user", "posts", user.walletAddress],
        });
      }
    }, [queryClient, user?.walletAddress])
  );

  const scrollY = useSharedValue(0);
  const [shouldShowStickyTabs, setShouldShowStickyTabs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const menuSheetRef = useRef<ProfileMenuSheetRef>(null);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

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

  const headerHeight = insets.top + HEADER_BAR_HEIGHT;
  const stickyThreshold = PROFILE_CONTENT_HEIGHT;

  const updateStickyState = useCallback((shouldStick: boolean) => {
    setShouldShowStickyTabs(shouldStick);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      const shouldStick = event.contentOffset.y >= stickyThreshold;
      runOnJS(updateStickyState)(shouldStick);
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
  const followersCount = user?.followerCount ?? 0;

  const gradientColor = useMemo(() => getGradientColor(username), [username]);
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
    console.log("Followers pressed");
  }, []);

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
        console.warn("Cannot navigate: missing root post ID for comment", commentId);
        return;
      }
      router.push(`/post/${rootPostId}?highlight=${commentId}`);
    },
    [router]
  );

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      router.push(`/user/${authorId}`);
    },
    [router]
  );

  const handlePostMorePress = useCallback((post: Post) => {
    setSelectedPost(post);
    postOptionsSheetRef.current?.present();
  }, []);

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
    [reportHandler, globalHidePost]
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
    [refetchUserStatus, refetchProfile, queryClient, user?.walletAddress]
  );

  const stickyTabsAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [stickyThreshold - 20, stickyThreshold],
      [0, 1],
      "clamp"
    );
    return { opacity };
  });

  const getTabType = () => {
    switch (activeTab) {
      case 0:
        return "posts";
      case 1:
        return "comments";
      case 2:
        return "about";
      default:
        return "posts";
    }
  };

  return (
    <Box flex background="base">
      <ProfileHeaderBar
        username={username}
        userLevel={userStatus?.user_level ?? 0}
        gradientColor={gradientColor}
        scrollY={scrollY}
        isRefreshing={isRefreshing}
        isLoading={isLoading}
        onBackPress={handleBackPress}
        onSharePress={handleSharePress}
        onMenuPress={handleMenuPress}
      />

      {shouldShowStickyTabs && (
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
          />
        </Animated.View>
      )}

      <Animated.ScrollView
        ref={scrollViewRef as any}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        bounces={true}
        nestedScrollEnabled
      >
      <ProfileContent
        username={username}
         avatarSeed={user?.walletAddress || username}
        avatarUrl={avatarUrl}
         walletAddress={user?.walletAddress || "0x0000...0000"}
         followersCount={followersCount}
         balance={profileData.balance}
         reserve={profileData.reserve}
         accountAgeDays={profileData.accountAgeDays}
          userLevel={userStatus?.user_level ?? 0}
         gradientColor={gradientColor}
         scrollY={scrollY}
         onFollowersPress={handleFollowersPress}
         isLoading={isLoading}
       />

        <View style={{ backgroundColor: theme.colors.background.default }}>
          <ProfileTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabDoubleTap={handleTabDoubleTap}
            tabWidth={SCREEN_WIDTH}
          />
        </View>

        <View style={styles.tabContent}>
          <ProfileTabContent
            tabType={getTabType()}
            owner={user?.walletAddress}
            onSettingsPress={handleSettingsPress}
            onPostPress={handlePostPress}
            onCommentPress={handleCommentPress}
            onAuthorPress={handleAuthorPress}
            onMorePress={handlePostMorePress}
          />
        </View>
      </Animated.ScrollView>

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  stickyTabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 99,
  },
  tabContent: {
    flex: 1,
    minHeight: 400,
  },
}));
