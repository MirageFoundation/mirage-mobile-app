import {
  CreateFilledIcon,
  CreateOutlineIcon,
  FollowingFilledIcon,
  FollowingOutlineIcon,
  HomeFilledIcon,
  HomeOutlineIcon,
  InboxFilledIcon,
  InboxOutlineIcon,
} from "@/assets/figma-icons";
import {
  ScrollAnimationProvider,
  TAB_BAR_HEIGHT,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useAuthStore, useUIStore } from "@/src/stores";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Tabs that require authentication
const PROTECTED_TABS = ["following", "create", "inbox", "profile"];

const AnimatedTabBar = ({ state, descriptors, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { tabBarAnimatedStyle, scrollToTopAndRefresh, scrollToTopAndRefreshFollowing, scrollToTopAndRefreshProfile } =
    useScrollAnimationContext();

  // Auth state
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);

  return (
    <Animated.View
      style={[
        styles.tabBar as any,
        { paddingBottom: insets.bottom },
        tabBarAnimatedStyle,
      ]}
    >
      <View style={styles.tabBarContent}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            // Check if this is a protected tab and user is not logged in
            if (PROTECTED_TABS.includes(route.name) && !isLoggedIn) {
              // Show auth sheet instead of navigating
              showAuthSheet();
              return;
            }

            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            // If already on home tab, scroll to top and refresh
            if (isFocused && route.name === "index") {
              scrollToTopAndRefresh();
              return;
            }

            // If already on following tab, scroll to top and refresh
            if (isFocused && route.name === "following") {
              scrollToTopAndRefreshFollowing();
              return;
            }

            // If already on profile tab, scroll to top and refresh
            if (isFocused && route.name === "profile") {
              scrollToTopAndRefreshProfile();
              return;
            }

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabBarItem
              key={route.key}
              routeName={route.name}
              label={options.title || route.name}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </Animated.View>
  );
};

const TabBarItem = ({
  routeName,
  label,
  isFocused,
  onPress,
}: {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
}) => {
  const scale = useSharedValue(1);
  const { theme } = useUnistyles();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.9, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 100 });
    onPress();
  };

  const iconColor = isFocused
    ? theme.colors.primary[500]
    : 'rgb(144,161,171)';

  const renderIcon = () => {
    const iconSize = 20;

    switch (routeName) {
      case "index":
        return isFocused ? (
          <HomeFilledIcon size={iconSize} color={iconColor} />
        ) : (
          <HomeOutlineIcon size={iconSize} color={iconColor} />
        );
      case "following":
        return isFocused ? (
          <FollowingFilledIcon size={iconSize} color={iconColor} />
        ) : (
          <FollowingOutlineIcon size={iconSize} color={iconColor} />
        );
      case "create":
        return isFocused ? (
          <CreateFilledIcon size={iconSize} color={iconColor} />
        ) : (
          <CreateOutlineIcon size={iconSize} color={iconColor} />
        );
      case "inbox":
        return isFocused ? (
          <InboxFilledIcon size={iconSize} color={iconColor} />
        ) : (
          <InboxOutlineIcon size={iconSize} color={iconColor} />
        );
      case "profile":
        // Profile still uses Ionicons as we don't have a custom profile icon yet
        return (
          <Ionicons
            name={isFocused ? "person" : "person-outline"}
            size={iconSize}
            color={iconColor}
          />
        );
      default:
        return (
          <Ionicons name="help-outline" size={iconSize} color={iconColor} />
        );
    }
  };

  return (
    <Animated.View
      style={[styles.tabItem, animatedStyle]}
      onTouchStart={handlePressIn}
      onTouchEnd={handlePressOut}
    >
      {renderIcon()}
      <Text
        style={{
          fontSize: 9,
          fontWeight: "500",
          color: isFocused
            ? theme.colors.primary[500]
            : 'rgb(144,161,171)',
        }}
      >
        {label}
      </Text>
    </Animated.View>
  );
};

function TabsContent() {
  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="following"
        options={{
          title: "Following",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "Create",
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <ScrollAnimationProvider>
      <TabsContent />
    </ScrollAnimationProvider>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border.subtle,
  },
  tabBarContent: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "space-around",
    // paddingHorizontal: theme.spacing.md,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabIcon: {
    color: theme.colors.text.subtle,
  },
  tabIconFocused: {
    color: theme.colors.primary[500],
  },
}));
