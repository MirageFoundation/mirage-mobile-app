import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Dimensions, Share, View } from "react-native";
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
  getGradientColor,
  PROFILE_CONTENT_HEIGHT,
  ProfileContent,
  ProfileHeaderBar,
  ProfileMenuSheet,
  ProfileMenuSheetRef,
  ProfileTabBar,
  ProfileTabContent,
} from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";

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
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  // Fetch user status and profile data
  const { data: userStatus, isLoading: isLoadingStatus } = useUserStatus();

  const { data: profile, isLoading: isLoadingProfile } = useProfile();

  // Scroll tracking
  const scrollY = useSharedValue(0);
  const [shouldShowStickyTabs, setShouldShowStickyTabs] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<PagerView>(null);

  // Menu sheet ref
  const menuSheetRef = useRef<ProfileMenuSheetRef>(null);

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
        url: `https://mirage.app/u/${user?.username}`,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  }, [user?.username]);

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
    console.log("Settings pressed");
  }, []);

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  }, []);

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
            tabWidth={SCREEN_WIDTH}
          />
        </Animated.View>
      )}

      {/* Single Scrollable Content */}
      <Animated.ScrollView
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
                onSettingsPress={handleSettingsPress}
              />
            </View>
            <View key="comments" style={styles.page}>
              <ProfileTabContent
                tabType="comments"
                onSettingsPress={handleSettingsPress}
              />
            </View>
            <View key="about" style={styles.page}>
              <ProfileTabContent
                tabType="about"
                onSettingsPress={handleSettingsPress}
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
