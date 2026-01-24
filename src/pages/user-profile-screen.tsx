import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, Share, View } from "react-native";
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
  useUserFollowed,
  useUserBlocked,
} from "@/src/api/read";
import {
  useToggleFollowUser,
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
  ProfileTabContent,
  ReportSheet,
  ReportSheetRef,
  UserProfileMenuSheet,
  UserProfileMenuSheetRef,
} from "@/src/components/molecules";
import { UserProfileContent } from "@/src/components/molecules/user-profile-content";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  useBlockHandler,
  useDeleteHandler,
  useReportHandler,
} from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
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

export function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const toast = useToast();

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

  const { data: followedData } = useUserFollowed();
  const { data: blockedData } = useUserBlocked();

  const scrollY = useSharedValue(0);
  const [shouldShowStickyTabs, setShouldShowStickyTabs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const userMenuSheetRef = useRef<UserProfileMenuSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showReportUserSheet, setShowReportUserSheet] = useState(false);

  const [showBlockUserConfirmation, setShowBlockUserConfirmation] = useState(false);
  const [isBlockingUser, setIsBlockingUser] = useState(false);

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

  const toggleFollowMutation = useToggleFollowUser();
  const blockUserMutation = useBlockUser();
  const unblockUserMutation = useUnblockUser();

  const isFollowing = useMemo(() => {
    if (!userAddress || !followedData?.followed_users) return false;
    return followedData.followed_users.includes(userAddress);
  }, [userAddress, followedData?.followed_users]);

  const isBlocked = useMemo(() => {
    if (!userAddress || !blockedData?.blocked_users) return false;
    return blockedData.blocked_users.includes(userAddress);
  }, [userAddress, blockedData?.blocked_users]);

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

  const displayUsername = userStatus?.username ?? profile?.username;
  const username = displayUsername ?? "user";
  const avatarUrl = profile?.avatar || undefined;
  const followersCount = 0;

  const gradientColor = useMemo(() => getGradientColor(username), [username]);
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
  }, []);

 const handleFollow = useCallback(() => {
   if (!userAddress) return;
   toggleFollowMutation.mutate(
     {
       userAddress,
       isCurrentlyFollowing: false,
     },
     {
       onSuccess: () => {
          toast.success(`Followed @${displayUsername || "user"}`);
       },
       onError: () => {
          toast.error("Failed to follow user");
       },
     }
   );
 }, [userAddress, displayUsername, toggleFollowMutation, toast]);

 const handleUnfollow = useCallback(() => {
   if (!userAddress) return;
   toggleFollowMutation.mutate(
     {
       userAddress,
       isCurrentlyFollowing: true,
     },
     {
       onSuccess: () => {
          toast.success(`Unfollowed @${displayUsername || "user"}`);
       },
       onError: () => {
          toast.error("Failed to unfollow user");
       },
     }
   );
 }, [userAddress, displayUsername, toggleFollowMutation, toast]);

  const handleRequestBlockUser = useCallback(() => {
    setShowBlockUserConfirmation(true);
  }, []);

 const handleConfirmBlockUser = useCallback(() => {
   if (!userAddress) return;
   setIsBlockingUser(true);
   blockUserMutation.mutate(userAddress, {
     onSuccess: () => {
       setShowBlockUserConfirmation(false);
       setIsBlockingUser(false);
        toast.success(
          `Blocked @${displayUsername || "user"}`,
          "You won't see their content anymore"
        );
     },
     onError: () => {
       setShowBlockUserConfirmation(false);
       setIsBlockingUser(false);
        toast.error("Failed to block user");
     },
   });
 }, [userAddress, displayUsername, blockUserMutation, toast]);

  const handleCancelBlockUser = useCallback(() => {
    setShowBlockUserConfirmation(false);
  }, []);

 const handleUnblockUser = useCallback(() => {
   if (!userAddress) return;
   unblockUserMutation.mutate(userAddress, {
     onSuccess: () => {
        toast.success(`Unblocked @${displayUsername || "user"}`);
     },
     onError: () => {
        toast.error("Failed to unblock user");
     },
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
     reportSheetRef.current?.dismiss();
     setShowReportUserSheet(false);
      toast.success(
        "Report submitted",
        "Thank you for helping keep Mirage safe"
      );
   },
   [userAddress, toast]
 );

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
    if (reportHandler.showReportSheet && !showReportUserSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet, showReportUserSheet]);

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
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

  const BlockedUserOverlay = () => (
    <View style={[styles.blockedOverlay, { backgroundColor: theme.colors.background.default }]}>
      <View style={styles.blockedContent}>
        <View style={[styles.blockedIconContainer, { backgroundColor: theme.colors.background.subtle }]}>
          <Ionicons name="ban-outline" size={48} color={theme.colors.text.subtle} />
        </View>
        <Text size="lg" weight="bold" style={styles.blockedTitle}>
          User Blocked
        </Text>
        <Text size="sm" mode="subtle" style={styles.blockedDescription}>
          You have blocked @{displayUsername || "this user"}. Unblock to see their profile and content.
        </Text>
        <Pressable
          onPress={handleUnblockUser}
          style={[styles.unblockButton, { backgroundColor: theme.colors.primary[500] }]}
        >
          <Text size="sm" weight="semibold" style={styles.unblockButtonText}>
            Unblock User
          </Text>
        </Pressable>
      </View>
    </View>
  );

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

      {shouldShowStickyTabs && !isBlocked && (
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

      {isBlocked ? (
        <View style={[styles.blockedContainer, { paddingTop: headerHeight }]}>
          <BlockedUserOverlay />
        </View>
      ) : (
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
          <UserProfileContent
            username={username}
            avatarSeed={username}
            avatarUrl={avatarUrl}
            walletAddress={userAddress || "0x0000...0000"}
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
              owner={userAddress ?? undefined}
              onPostPress={handlePostPress}
              onCommentPress={handleCommentPress}
              onAuthorPress={handleAuthorPress}
              onMorePress={handlePostMorePress}
            />
          </View>
        </Animated.ScrollView>
      )}

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
        targetType={showReportUserSheet ? "post" : reportHandler.pendingTarget?.type}
        onSubmit={showReportUserSheet ? handleReportUserSubmit : handleReportSubmit}
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
  blockedContainer: {
    flex: 1,
  },
  blockedOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  blockedContent: {
    alignItems: "center",
    maxWidth: 300,
  },
  blockedIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  blockedTitle: {
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  blockedDescription: {
    textAlign: "center",
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  unblockButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.full,
  },
  unblockButtonText: {
    color: "#FFFFFF",
  },
}));
