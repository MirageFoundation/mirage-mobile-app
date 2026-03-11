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
  interpolate,
  interpolateColor,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ProfilePostsList } from "./profile-posts-list";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type TabType = "posts" | "comments" | "about";
export const PROFILE_TAB_BAR_HEIGHT = 50;

type ProfileTabsProps = {
  onSettingsPress?: () => void;
};

const TABS: { key: TabType; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "about", label: "About" },
];

const emptyPostImage = require("@/assets/images/empty-post.png");
const emptyCommentsImage = require("@/assets/images/empty-comments.png");
const emptyInfoImage = require("@/assets/images/empty-info.png");

const EMPTY_STATE_CONFIG: Record<
 TabType,
 {
   image: ImageSourcePropType;
   title: string;
   subtitle: string;
   otherUserTitle: string;
   otherUserSubtitle: string;
    blockedTitle: string;
    blockedSubtitle: string;
 }
> = {
 posts: {
   image: emptyPostImage,
   title: "You don't have any posts yet",
   subtitle:
     "Once you post to a community, it'll show up here. If you'd rather hide your posts, update your settings.",
   otherUserTitle: "No posts yet",
   otherUserSubtitle: "This user hasn't posted anything yet.",
    blockedTitle: "User Blocked",
    blockedSubtitle: "You have blocked this user. Unblock to see their posts.",
 },
 comments: {
   image: emptyCommentsImage,
   title: "You don't have any comments yet",
   subtitle:
     "Once you comment on a post, it'll show up here. If you'd rather hide your comments, update your settings.",
   otherUserTitle: "No comments yet",
   otherUserSubtitle: "This user hasn't commented on anything yet.",
    blockedTitle: "User Blocked",
    blockedSubtitle: "You have blocked this user. Unblock to see their comments.",
 },
 about: {
   image: emptyInfoImage,
   title: "Nothing here yet",
   subtitle:
     "Add information about yourself to help others learn more about you. Update your settings to get started.",
   otherUserTitle: "Nothing here yet",
   otherUserSubtitle: "This user hasn't added any information about themselves.",
    blockedTitle: "User Blocked",
    blockedSubtitle: "You have blocked this user. Unblock to see their profile.",
 },
};

export const ProfileEmptyState = ({
 tabType,
 onSettingsPress,
 isOwnProfile = true,
  isBlocked = false,
  onUnblock,
}: {
 tabType: TabType;
 onSettingsPress?: () => void;
 isOwnProfile?: boolean;
  isBlocked?: boolean;
  onUnblock?: () => void;
}) => {
 const { theme } = useUnistyles();
 const insets = useSafeAreaInsets();
 const config = EMPTY_STATE_CONFIG[tabType];

  const title = isBlocked
    ? config.blockedTitle
    : isOwnProfile
      ? config.title
      : config.otherUserTitle;
  const subtitle = isBlocked
    ? config.blockedSubtitle
    : isOwnProfile
      ? config.subtitle
      : config.otherUserSubtitle;

 return (
   <View
     style={[
       styles.emptyStateContainer,
       { paddingBottom: insets.bottom + 100 },
     ]}
   >
     <Image
       source={config.image}
       style={styles.emptyImage}
       contentFit="contain"
     />

     <RNText style={[styles.emptyTitle, { color: theme.colors.text.default }]}>
       {title}
     </RNText>

     <RNText
       style={[styles.emptySubtitle, { color: theme.colors.text.subtle }]}
     >
       {subtitle}
     </RNText>

      {isBlocked && onUnblock && (
        <Pressable onPress={onUnblock} style={styles.settingsButton}>
          <RNText style={styles.settingsButtonText}>Unblock User</RNText>
        </Pressable>
      )}

      {!isBlocked && isOwnProfile && (
       <Pressable onPress={onSettingsPress} style={styles.settingsButton}>
         <RNText style={styles.settingsButtonText}>Update Settings</RNText>
       </Pressable>
     )}
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
 isOwnProfile?: boolean;
  isBlocked?: boolean;
  onUnblock?: () => void;
}

export const ProfileTabContent = ({
 tabType,
 owner,
 onSettingsPress,
 onPostPress,
 onCommentPress,
 onAuthorPress,
 onMorePress,
 isOwnProfile = true,
  isBlocked = false,
  onUnblock,
}: ProfileTabContentProps) => {
  if (isBlocked) {
    return (
      <ProfileEmptyState
        tabType={tabType}
        isOwnProfile={isOwnProfile}
        isBlocked={true}
        onUnblock={onUnblock}
      />
    );
  }

 if (tabType === "about") {
   return (
     <ProfileEmptyState tabType={tabType} onSettingsPress={onSettingsPress} isOwnProfile={isOwnProfile} />
   );
 }

  if (!owner) {
    return (
      <ProfileEmptyState tabType={tabType} onSettingsPress={onSettingsPress} isOwnProfile={isOwnProfile} />
    );
  }

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
        <ProfileEmptyState tabType={tabType} onSettingsPress={onSettingsPress} isOwnProfile={isOwnProfile} />
      }
    />
  );
};

const DOUBLE_TAP_DELAY = 300;

const AnimatedTabLabel = ({
  label,
  index,
  animatedIndex,
  activeColor,
  inactiveColor,
}: {
  label: string;
  index: number;
  animatedIndex: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
}) => {
  const animStyle = useAnimatedStyle(() => {
    const distance = Math.abs(animatedIndex.value - index);
    const opacity = interpolate(distance, [0, 0.5, 1], [1, 0.6, 0.5], "clamp");
    const scale = interpolate(distance, [0, 1], [1, 0.97], "clamp");
    const color = interpolateColor(
      distance,
      [0, 0.5],
      [activeColor, inactiveColor],
    );
    return {
      opacity,
      transform: [{ scale }],
      color,
      fontWeight: distance < 0.5 ? "700" : "500",
    } as any;
  });

  return (
    <Animated.Text style={[styles.tabLabel, animStyle]}>
      {label}
    </Animated.Text>
  );
};

export const ProfileTabBar = ({
  activeTab,
  onTabChange,
  onTabDoubleTap,
  tabWidth,
  animatedIndex,
}: {
  activeTab: number;
  onTabChange: (index: number) => void;
  onTabDoubleTap?: (index: number) => void;
  tabWidth: number;
  animatedIndex?: SharedValue<number>;
}) => {
  const { theme } = useUnistyles();
  const internalPosition = useSharedValue(activeTab);
  const lastTapTimeRef = useRef<{ [key: number]: number }>({});

  const effectiveAnimatedIndex = animatedIndex ?? internalPosition;

  const handleTabPress = useCallback(
    (index: number) => {
      const now = Date.now();
      const lastTap = lastTapTimeRef.current[index] || 0;

      if (now - lastTap < DOUBLE_TAP_DELAY && activeTab === index) {
        onTabDoubleTap?.(index);
        lastTapTimeRef.current[index] = 0;
      } else {
        if (!animatedIndex) {
          internalPosition.value = withTiming(index, { duration: 200 });
        }
        onTabChange(index);
        lastTapTimeRef.current[index] = now;
      }
    },
    [onTabChange, onTabDoubleTap, internalPosition, activeTab, animatedIndex]
  );

  useEffect(() => {
    if (!animatedIndex) {
      internalPosition.value = withTiming(activeTab, { duration: 200 });
    }
  }, [activeTab, internalPosition, animatedIndex]);

  const singleTabWidth = tabWidth / TABS.length;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: effectiveAnimatedIndex.value * singleTabWidth }],
  }));

  return (
    <View style={styles.tabBarContainer}>
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.colors.background.default },
        ]}
      >
        {TABS.map((tab, index) => (
          <Pressable
            key={tab.key}
            onPress={() => handleTabPress(index)}
            style={styles.tab}
          >
            <AnimatedTabLabel
              label={tab.label}
              index={index}
              animatedIndex={effectiveAnimatedIndex}
              activeColor={theme.colors.text.default}
              inactiveColor={theme.colors.text.subtle}
            />
          </Pressable>
        ))}
      </View>

      <Animated.View
        style={[
          styles.indicator,
          { width: singleTabWidth, backgroundColor: theme.colors.text.default },
          indicatorStyle,
        ]}
      />

      <View
        style={[
          styles.tabBarBorder,
          { backgroundColor: theme.colors.border.subtle },
        ]}
      />
    </View>
  );
};

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
      <ProfileTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        tabWidth={SCREEN_WIDTH}
      />

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
    minHeight: PROFILE_TAB_BAR_HEIGHT,
  },
  tabBar: {
    flexDirection: "row",
    minHeight: PROFILE_TAB_BAR_HEIGHT,
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
