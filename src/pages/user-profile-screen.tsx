import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
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

import {
  useProfileByAddress,
  useUserStatusByAddress,
  useAddressFromUsername,
} from "@/src/api/read";
import {
  ConfirmationPopup,
  getGradientColor,
  type Post,
  PostOptionsSheet,
  PostOptionsSheetRef,
  PROFILE_CONTENT_HEIGHT,
  ProfileHeaderBar,
  ProfileTabBar,
  ProfileTabContent,
  ReportSheet,
  ReportSheetRef,
} from "@/src/components/molecules";
import { UserProfileContent } from "@/src/components/molecules/user-profile-content";
import { Box } from "@/src/components/ui/primitives";
import {
  useBlockHandler,
  useDeleteHandler,
  useReportHandler,
} from "@/src/hooks";
import { useAuthStore, useContentModerationStore, usePreferencesStore, getShareBaseUrl } from "@/src/stores";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

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
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const shareServer = usePreferencesStore((s) => s.shareServer);

  const currentUser = useAuthStore((s) => s.user);
  const scrollViewRef = useRef<ScrollView>(null);

  const isUsername = id && !id.startsWith("mirage");
  const { data: resolvedAddress, isLoading: isResolvingUsername } = useAddressFromUsername(
    isUsername ? id : null
  );

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

  const scrollY = useSharedValue(0);
  const [shouldShowStickyTabs, setShouldShowStickyTabs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<PagerView>(null);

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

  const username = userStatus?.username ?? profile?.username ?? id ?? "user";
  const avatarUrl = profile?.avatar || undefined;
  const followersCount = 0;

  const gradientColor = useMemo(() => getGradientColor(username), [username]);
  const isLoading = isResolvingUsername || isLoadingStatus || isLoadingProfile;

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleUsernamePress = useCallback(() => {
  }, []);

  const handleSearchPress = useCallback(() => {
  }, []);

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
  }, []);

  const handleFollowersPress = useCallback(() => {
  }, []);

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
    pagerRef.current?.setPage(index);
  }, []);

  const handleTabDoubleTap = useCallback(
    async (index: number) => {
      setIsRefreshing(true);
      try {
        await Promise.all([refetchUserStatus(), refetchProfile()]);
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
    [refetchUserStatus, refetchProfile, queryClient, userAddress]
  );

  const handlePageSelected = useCallback((e: any) => {
    setActiveTab(e.nativeEvent.position);
  }, []);

  const stickyTabsAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [stickyThreshold - 20, stickyThreshold],
      [0, 1],
      "clamp"
    );
    return { opacity };
  });

  const isOwnProfile = currentUser?.walletAddress === userAddress;

  return (
    <Box flex background="base">
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
      >
        <UserProfileContent
          username={username}
          avatarSeed={username}
          avatarUrl={avatarUrl}
          walletAddress={userAddress || "0x0000...0000"}
          followersCount={followersCount}
          balance={profileData.balance}
          reserve={profileData.reserve}
          accountAgeDays={profileData.accountAgeDays}
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
          <PagerView
            ref={pagerRef}
            style={styles.pagerView}
            initialPage={0}
            onPageSelected={handlePageSelected}
          >
            <View key="posts" style={styles.page}>
              <ProfileTabContent
                tabType="posts"
                owner={userAddress ?? undefined}
                onPostPress={handlePostPress}
                onCommentPress={handleCommentPress}
                onAuthorPress={handleAuthorPress}
                onMorePress={handlePostMorePress}
              />
            </View>
            <View key="comments" style={styles.page}>
              <ProfileTabContent
                tabType="comments"
                owner={userAddress ?? undefined}
                onPostPress={handlePostPress}
                onCommentPress={handleCommentPress}
                onAuthorPress={handleAuthorPress}
                onMorePress={handlePostMorePress}
              />
            </View>
            <View key="about" style={styles.page}>
              <ProfileTabContent
                tabType="about"
                owner={userAddress ?? undefined}
                onPostPress={handlePostPress}
                onCommentPress={handleCommentPress}
                onAuthorPress={handleAuthorPress}
                onMorePress={handlePostMorePress}
              />
            </View>
          </PagerView>
        </View>
      </Animated.ScrollView>

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={isOwnProfile}
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
