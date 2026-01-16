import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, ScrollView, Share, View } from "react-native";
import PagerView from "react-native-pager-view";
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

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// Height of the header bar (approximately)
const HEADER_BAR_HEIGHT = 56;

// Helper to convert umirage to mirage (1 mirage = 1,000,000 umirage)
const formatMirageBalance = (umirage: number): number => {
  return Math.floor(umirage / 1_000_000);
};

// Calculate account age in days from unix timestamp (returns fractional days)
const calculateAccountAgeDays = (
  createdAt: number | null | undefined
): number => {
  if (!createdAt) return 0;
  const now = Date.now() / 1000; // Current time in seconds
  const ageInSeconds = now - createdAt;
  return ageInSeconds / (60 * 60 * 24); // Convert to days (fractional)
};

export function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();

  // Scroll animation context for tab-press-to-refresh
  const { registerProfileScrollRef, registerProfileRefreshCallback } =
    useScrollAnimationContext();

  // Scroll view ref for scroll-to-top functionality
  const scrollViewRef = useRef<ScrollView>(null);

  // Fetch user status and profile data
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

  // Register scroll ref and refresh callback for tab-press-to-refresh
  useEffect(() => {
    registerProfileScrollRef(scrollViewRef.current);
  }, [registerProfileScrollRef]);

  useEffect(() => {
    const handleRefresh = async () => {
      // Show refresh indicator
      setIsRefreshing(true);
      try {
        // Refetch profile data
        await Promise.all([refetchUserStatus(), refetchProfile()]);
        // Invalidate user posts queries to refresh posts/comments tabs
        // Query key is ["user", "posts", owner, type]
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

  // Refetch data when screen comes into focus (e.g., after creating a post)
  useFocusEffect(
    useCallback(() => {
      // Invalidate user posts queries to fetch fresh data
      if (user?.walletAddress) {
        queryClient.invalidateQueries({
          queryKey: ["user", "posts", user.walletAddress],
        });
      }
    }, [queryClient, user?.walletAddress])
  );

  // Scroll tracking
  const scrollY = useSharedValue(0);
  const [shouldShowStickyTabs, setShouldShowStickyTabs] = useState(false);

  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<PagerView>(null);

  // Menu sheet ref
  const menuSheetRef = useRef<ProfileMenuSheetRef>(null);

  // Post options sheet refs
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);

  // Selected post for options sheet
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // Content moderation store
  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);

  // Delete, Block, and Report handlers
  const deleteHandler = useDeleteHandler({});
  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});

  // Calculate heights
  const headerHeight = insets.top + HEADER_BAR_HEIGHT;
  // Point at which tabs should become sticky (when they reach the header)
  const stickyThreshold = PROFILE_CONTENT_HEIGHT;

  const updateStickyState = useCallback((shouldStick: boolean) => {
    setShouldShowStickyTabs(shouldStick);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;

      // Check if tabs should be sticky
      const shouldStick = event.contentOffset.y >= stickyThreshold;
      runOnJS(updateStickyState)(shouldStick);
    },
  });

  // Derive profile data from API responses
  const profileData = useMemo(() => {
    // Use API data when available, fallback to sensible defaults
    const balance = userStatus?.balance ?? 0;
    const reserve = userStatus?.reserve_funds ?? 0;

    // Use profile.created_at for account age, fallback to profile_registered_at from status
    const createdAt = profile?.created_at ?? userStatus?.profile_registered_at;
    const accountAgeDays = calculateAccountAgeDays(createdAt);

    return {
      balance: formatMirageBalance(balance),
      reserve: formatMirageBalance(reserve),
      accountAgeDays,
    };
  }, [userStatus, profile]);

  // Determine username (from API or auth store)
  const username = userStatus?.username ?? user?.username ?? "user";

  // Get avatar URL from profile if available
  const avatarUrl = profile?.avatar || undefined;

  // Get followers count from profile (followed_users array represents who the user follows, not followers)
  // Note: The API doesn't directly provide follower count, using user.followerCount as fallback
  const followersCount = user?.followerCount ?? 0;

  const gradientColor = useMemo(() => getGradientColor(username), [username]);

  // Combined loading state
  const isLoading = isLoadingStatus || isLoadingProfile;

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleUsernamePress = useCallback(() => {
    console.log("Username pressed");
  }, []);

  const handleSearchPress = useCallback(() => {
    console.log("Search pressed");
  }, []);

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

  // Menu sheet handlers
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

  const handleEditPress = useCallback(() => {
    console.log("Edit pressed");
  }, []);

  const handleFollowersPress = useCallback(() => {
    console.log("Followers pressed");
  }, []);

  const handleSettingsPress = useCallback(() => {
    router.push("/settings");
  }, [router]);

  // Navigation handlers for posts and comments tabs
  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleCommentPress = useCallback(
    (commentId: string, rootPostId: string) => {
      // Safety check - don't navigate if we don't have a valid post ID
      if (!rootPostId || rootPostId === "undefined") {
        console.warn("Cannot navigate: missing root post ID for comment", commentId);
        return;
      }
      // Navigate to the post and highlight the comment
      router.push(`/post/${rootPostId}?highlight=${commentId}`);
    },
    [router]
  );

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      // For now, just log - could navigate to author profile in the future
      console.log("Author pressed:", authorId);
    },
    []
  );

  // Post options handlers
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

  // Optimistic confirm handlers
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

  // Present report sheet when showReportSheet is true
  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  }, []);

  // Handle double-tap on tab to refresh that specific tab
  const handleTabDoubleTap = useCallback(
    async (index: number) => {
      setIsRefreshing(true);
      try {
        // Refresh profile data
        await Promise.all([refetchUserStatus(), refetchProfile()]);
        // Invalidate user posts queries for the specific tab type
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

  const handlePageSelected = useCallback((e: any) => {
    setActiveTab(e.nativeEvent.position);
  }, []);

  // Animated style for sticky tabs fade in
  const stickyTabsAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [stickyThreshold - 20, stickyThreshold],
      [0, 1],
      "clamp"
    );
    return { opacity };
  });

  return (
    <Box flex background="base">
      {/* Fixed Header Bar - Always at top */}
      <ProfileHeaderBar
        username={username}
        gradientColor={gradientColor}
        scrollY={scrollY}
        isRefreshing={isRefreshing}
        onBackPress={handleBackPress}
        onUsernamePress={handleUsernamePress}
        onSearchPress={handleSearchPress}
        onSharePress={handleSharePress}
        onMenuPress={handleMenuPress}
      />

      {/* Sticky Tab Bar - Fixed below header when scrolled */}
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

      {/* Single Scrollable Content */}
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
      >
        {/* Profile Content - Scrolls and fades */}
        <ProfileContent
          username={username}
          avatarSeed={username}
          avatarUrl={avatarUrl}
          walletAddress={user?.walletAddress || "0x0000...0000"}
          followersCount={followersCount}
          balance={profileData.balance}
          reserve={profileData.reserve}
          accountAgeDays={profileData.accountAgeDays}
          gradientColor={gradientColor}
          scrollY={scrollY}
          onEditPress={handleEditPress}
          onFollowersPress={handleFollowersPress}
          isLoading={isLoading}
        />

        {/* Inline Tab Bar (scrolls with content) */}
        <View style={{ backgroundColor: theme.colors.background.default }}>
          <ProfileTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabDoubleTap={handleTabDoubleTap}
            tabWidth={SCREEN_WIDTH}
          />
        </View>

        {/* Tab Content - Uses PagerView for swipe */}
        <View style={styles.tabContent}>
          <PagerView
            ref={pagerRef}
            style={styles.pagerView}
            initialPage={0}
            onPageSelected={handlePageSelected}
          >
            <View key="posts" style={styles.page}>
              <ProfileTabContent
                tabType="posts"
                owner={user?.walletAddress}
                onSettingsPress={handleSettingsPress}
                onPostPress={handlePostPress}
                onCommentPress={handleCommentPress}
                onAuthorPress={handleAuthorPress}
                onMorePress={handlePostMorePress}
              />
            </View>
            <View key="comments" style={styles.page}>
              <ProfileTabContent
                tabType="comments"
                owner={user?.walletAddress}
                onSettingsPress={handleSettingsPress}
                onPostPress={handlePostPress}
                onCommentPress={handleCommentPress}
                onAuthorPress={handleAuthorPress}
                onMorePress={handlePostMorePress}
              />
            </View>
            <View key="about" style={styles.page}>
              <ProfileTabContent
                tabType="about"
                owner={user?.walletAddress}
                onSettingsPress={handleSettingsPress}
                onPostPress={handlePostPress}
                onCommentPress={handleCommentPress}
                onAuthorPress={handleAuthorPress}
                onMorePress={handlePostMorePress}
              />
            </View>
          </PagerView>
        </View>
      </Animated.ScrollView>

      {/* Profile Menu Bottom Sheet */}
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

      {/* Post Options Sheet */}
      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={true}
        onDelete={handleDeletePost}
        onBlockPost={handleBlockPost}
        onReport={handleReportPost}
        onDismiss={() => setSelectedPost(null)}
      />

      {/* Delete Confirmation Popup */}
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

      {/* Block Confirmation Popup */}
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

      {/* Report Sheet */}
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
    minHeight: SCREEN_HEIGHT,
  },
  pagerView: {
    flex: 1,
    minHeight: SCREEN_HEIGHT,
  },
  page: {
    flex: 1,
  },
}));
