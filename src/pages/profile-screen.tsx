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

import {
  getGradientColor,
  PROFILE_CONTENT_HEIGHT,
  ProfileContent,
  ProfileHeaderBar,
  ProfileTabBar,
  ProfileTabContent,
} from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// Height of the header bar (approximately)
const HEADER_BAR_HEIGHT = 56;

export function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  // Scroll tracking
  const scrollY = useSharedValue(0);
  const [shouldShowStickyTabs, setShouldShowStickyTabs] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<PagerView>(null);

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

  // Mock data for development
  const mockProfileData = {
    balance: 12450,
    reserve: 5230,
    accountAgeDays: 127,
  };

  const username = user?.username || "user";
  const gradientColor = useMemo(() => getGradientColor(username), [username]);

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
    console.log("Menu pressed");
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
          avatarSeed={user?.username}
          avatarUrl={undefined}
          walletAddress={user?.walletAddress || "0x0000...0000"}
          followersCount={user?.followerCount || 0}
          balance={mockProfileData.balance}
          reserve={mockProfileData.reserve}
          accountAgeDays={mockProfileData.accountAgeDays}
          gradientColor={gradientColor}
          scrollY={scrollY}
          onEditPress={handleEditPress}
          onFollowersPress={handleFollowersPress}
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
