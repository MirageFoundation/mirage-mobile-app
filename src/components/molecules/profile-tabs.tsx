import { sizing } from "@/src/config/sizing";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  ImageSourcePropType,
  Pressable,
  Text as RNText,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ProfilePostsList } from "./profile-posts-list";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type TabType = "posts" | "comments" | "about";

type ProfileTabsProps = {
  onSettingsPress?: () => void;
};

// Tab configuration
const TABS: { key: TabType; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "about", label: "About" },
];

// Import images
const emptyPostImage = require("@/assets/images/empty-post.png");
const emptyCommentsImage = require("@/assets/images/empty-comments.png");
const emptyInfoImage = require("@/assets/images/empty-info.png");

// Empty state configuration per tab with images
const EMPTY_STATE_CONFIG: Record<
  TabType,
  {
    image: ImageSourcePropType;
    title: string;
    subtitle: string;
  }
> = {
  posts: {
    image: emptyPostImage,
    title: "You don't have any posts yet",
    subtitle:
      "Once you post to a community, it'll show up here. If you'd rather hide your posts, update your settings.",
  },
  comments: {
    image: emptyCommentsImage,
    title: "You don't have any comments yet",
    subtitle:
      "Once you comment on a post, it'll show up here. If you'd rather hide your comments, update your settings.",
  },
  about: {
    image: emptyInfoImage,
    title: "Nothing here yet",
    subtitle:
      "Add information about yourself to help others learn more about you. Update your settings to get started.",
  },
};

// Empty State Component - reusable for all tabs
export const ProfileEmptyState = ({
  tabType,
  onSettingsPress,
}: {
  tabType: TabType;
  onSettingsPress?: () => void;
}) => {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const config = EMPTY_STATE_CONFIG[tabType];

  return (
    <View
      style={[
        styles.emptyStateContainer,
        { paddingBottom: insets.bottom + 100 },
      ]}
    >
      {/* Image */}
      <Image
        source={config.image}
        style={styles.emptyImage}
        contentFit="contain"
      />

      {/* Title */}
      <RNText style={[styles.emptyTitle, { color: theme.colors.text.default }]}>
        {config.title}
      </RNText>

      {/* Subtitle */}
      <RNText
        style={[styles.emptySubtitle, { color: theme.colors.text.subtle }]}
      >
        {config.subtitle}
      </RNText>

      {/* Settings Button */}
      <Pressable onPress={onSettingsPress} style={styles.settingsButton}>
        <RNText style={styles.settingsButtonText}>Update Settings</RNText>
      </Pressable>
    </View>
  );
};

interface ProfileTabContentProps {
  tabType: TabType;
  owner?: string;
  onSettingsPress?: () => void;
  onPostPress?: (postId: string) => void;
  onCommentPress?: (commentId: string, rootPostId: string) => void;
  onAuthorPress?: (authorId: string) => void;
  onMorePress?: (post: any) => void;
}

// Tab Content Component - renders posts list or empty state
export const ProfileTabContent = ({
  tabType,
  owner,
  onSettingsPress,
  onPostPress,
  onCommentPress,
  onAuthorPress,
  onMorePress,
}: ProfileTabContentProps) => {
  // About tab - show empty state (for now)
  if (tabType === "about") {
    return (
      <ProfileEmptyState tabType={tabType} onSettingsPress={onSettingsPress} />
    );
  }

  // No owner - show empty state
  if (!owner) {
    return (
      <ProfileEmptyState tabType={tabType} onSettingsPress={onSettingsPress} />
    );
  }

  // Posts and Comments tabs
  const type = tabType === "posts" ? "submissions" : "comments";

  return (
    <ProfilePostsList
      owner={owner}
      type={type}
      onPostPress={onPostPress ?? (() => {})}
      onCommentPress={onCommentPress ?? (() => {})}
      onAuthorPress={onAuthorPress}
      onMorePress={onMorePress}
      ListEmptyComponent={
        <ProfileEmptyState tabType={tabType} onSettingsPress={onSettingsPress} />
      }
    />
  );
};

// Double tap detection threshold in ms
const DOUBLE_TAP_DELAY = 300;

// Tab Bar Component - exported for use in ProfileScreen
export const ProfileTabBar = ({
  activeTab,
  onTabChange,
  onTabDoubleTap,
  tabWidth,
}: {
  activeTab: number;
  onTabChange: (index: number) => void;
  onTabDoubleTap?: (index: number) => void;
  tabWidth: number;
}) => {
  const { theme } = useUnistyles();
  const indicatorPosition = useSharedValue(0);
  const lastTapTimeRef = useRef<{ [key: number]: number }>({});

  const handleTabPress = useCallback(
    (index: number) => {
      const now = Date.now();
      const lastTap = lastTapTimeRef.current[index] || 0;

      // Check for double tap on the same tab
      if (now - lastTap < DOUBLE_TAP_DELAY && activeTab === index) {
        // Double tap detected on active tab - trigger refresh
        onTabDoubleTap?.(index);
        lastTapTimeRef.current[index] = 0; // Reset to prevent triple tap
      } else {
        // Single tap - switch tab
        indicatorPosition.value = withTiming(index, { duration: 200 });
        onTabChange(index);
        lastTapTimeRef.current[index] = now;
      }
    },
    [onTabChange, onTabDoubleTap, indicatorPosition, activeTab]
  );

  // Update indicator when activeTab changes (from swipe)
  useEffect(() => {
    indicatorPosition.value = withTiming(activeTab, { duration: 200 });
  }, [activeTab, indicatorPosition]);

  const singleTabWidth = tabWidth / TABS.length;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value * singleTabWidth }],
  }));

  return (
    <View style={styles.tabBarContainer}>
      {/* Tabs */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.colors.background.default },
        ]}
      >
        {TABS.map((tab, index) => {
          const isActive = activeTab === index;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabPress(index)}
              style={styles.tab}
            >
              <RNText
                style={[
                  styles.tabLabel,
                  {
                    color: isActive
                      ? theme.colors.text.default
                      : theme.colors.text.subtle,
                    fontWeight: isActive ? "700" : "500",
                  },
                ]}
              >
                {tab.label}
              </RNText>
            </Pressable>
          );
        })}
      </View>

      {/* Animated Indicator */}
      <Animated.View
        style={[
          styles.indicator,
          { width: singleTabWidth, backgroundColor: theme.colors.text.default },
          indicatorStyle,
        ]}
      />

      {/* Bottom Border */}
      <View
        style={[
          styles.tabBarBorder,
          { backgroundColor: theme.colors.border.subtle },
        ]}
      />
    </View>
  );
};

// Full ProfileTabs component (for standalone use)
export const ProfileTabs = ({ onSettingsPress }: ProfileTabsProps) => {
  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<PagerView>(null);

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  }, []);

  const handlePageSelected = useCallback((e: any) => {
    setActiveTab(e.nativeEvent.position);
  }, []);

  return (
    <View style={styles.container}>
      {/* Tab Bar */}
      <ProfileTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        tabWidth={SCREEN_WIDTH}
      />

      {/* Swipeable Content */}
      <PagerView
        ref={pagerRef}
        style={styles.pagerView}
        initialPage={0}
        onPageSelected={handlePageSelected}
      >
        {TABS.map((tab) => (
          <View key={tab.key} style={styles.page}>
            <ProfileTabContent
              tabType={tab.key}
              onSettingsPress={onSettingsPress}
            />
          </View>
        ))}
      </PagerView>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 500,
  },
  tabBarContainer: {
    position: "relative",
  },
  tabBar: {
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 14,
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
  },
  tabBarBorder: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  pagerView: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyImage: {
    width: 180,
    height: 180,
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: 12,
    fontSize: 20,
    fontWeight: "700",
  },
  emptySubtitle: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    fontSize: 15,
  },
  settingsButton: {
    marginTop: 8,
    paddingVertical: sizing.sm,
    paddingHorizontal: sizing.md,
    borderRadius: 100,
    backgroundColor: "rgb(29, 68, 150)",
  },
  settingsButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
}));
