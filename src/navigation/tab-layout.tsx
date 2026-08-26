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
  type RefreshTargetKey,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useAuthStore, useUIStore } from "@/src/stores";
import { useInboxStore } from "@/src/stores/inbox-store";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname } from "expo-router";
import * as Sentry from "@sentry/react-native";
import {
  Pressable,
  StyleSheet as RNStyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useRef } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SideMenuProvider } from "@/src/providers/side-menu-provider";
import {
  signalTabsReady,
  signalTabsUnmounted,
} from "@/src/services/inbox-notifications";

// Tabs that require authentication
const PROTECTED_TABS = ["following", "create", "inbox", "profile"];
const REFRESH_TARGET_BY_ROUTE: Partial<Record<string, RefreshTargetKey>> = {
  index: "home",
  following: "following",
  profile: "profile",
};

const AnimatedTabBar = ({ state, descriptors, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const {
    tabBarAnimatedStyle,
    scrollToTopAndRefresh,
  } = useScrollAnimationContext();

  // Auth state
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const inboxUnreadCount = useInboxStore((s) => s.unreadCount);

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

            const refreshTarget = REFRESH_TARGET_BY_ROUTE[route.name];
            if (isFocused && refreshTarget) {
              void scrollToTopAndRefresh(refreshTarget).catch((error) => {
                Sentry.captureException(error, {
                  tags: { feature: "tab-bar", operation: "refresh-target" },
                  extra: { refreshTarget },
                });
              });
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
              badgeCount={route.name === "inbox" && isLoggedIn ? inboxUnreadCount : 0}
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
  badgeCount,
}: {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  badgeCount?: number;
}) => {
  const scale = useSharedValue(1);
  const { theme } = useUnistyles();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.85, { duration: 100 });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 100 });
  };

  const iconColor = isFocused
    ? theme.colors.primary[500]
    : theme.colors.text.subtle;

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
          <FollowingFilledIcon size={iconSize + 9.5} color={iconColor} />
        ) : (
          <FollowingOutlineIcon size={iconSize + 9.5} color={iconColor} />
        );
      case "create":
        return isFocused ? (
          <CreateFilledIcon size={iconSize} color={iconColor} />
        ) : (
          <CreateOutlineIcon size={iconSize} color={iconColor} />
        );
      case "inbox":
        return isFocused ? (
          <InboxFilledIcon size={iconSize + 2} color={iconColor} />
        ) : (
          <InboxOutlineIcon size={iconSize + 2} color={iconColor} />
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
    <Pressable
      style={styles.tabItem}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
    >
      <Animated.View style={[styles.tabItemInner, animatedStyle]}>
        <View style={{ position: "relative" }}>
          {renderIcon()}
          {(badgeCount ?? 0) > 0 && (
            <View
              style={{
                position: "absolute",
                top: -3,
                right: -10,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#EF4444",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 3,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 9,
                  fontWeight: "700",
                  lineHeight: 12,
                }}
              >
                {(badgeCount ?? 0) > 99 ? "99+" : badgeCount}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: 9,
            fontWeight: "500",
            color: isFocused
              ? theme.colors.primary[500]
              : theme.colors.text.subtle,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

function TabNavigationVisibilityReset() {
  const pathname = usePathname();
  const { showBars } = useScrollAnimationContext();

  useEffect(() => {
    showBars();
    if (pathname === "/" || pathname.endsWith("/(tabs)") || pathname.endsWith("/(tabs)/") || pathname.endsWith("/index")) {
      Sentry.addBreadcrumb({
        category: "feed-video",
        message: "Activated home feed playback",
        level: "info",
        data: { pathname },
      });
    } else if (pathname.endsWith("/following")) {
      Sentry.addBreadcrumb({
        category: "feed-video",
        message: "Activated following feed playback",
        level: "info",
        data: { pathname },
      });
    } else if (!pathname.startsWith("/topic/")) {
      Sentry.addBreadcrumb({
        category: "feed-video",
        message: "Disabled tab feed playback",
        level: "info",
        data: { pathname },
      });
    }
    if (pathname.endsWith("/inbox")) {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Tab chrome reset on inbox route",
        level: "info",
        data: { pathname },
      });
    }
  }, [pathname, showBars]);

  return null;
}

function TabsContent() {
  return (
    <>
      <TabNavigationVisibilityReset />
      <Tabs
        initialRouteName="index"
        backBehavior="initialRoute"
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
            lazy: false,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
          }}
        />
      </Tabs>
    </>
  );
}

export default function TabLayout() {
  const pathname = usePathname();
  const latestPathnameRef = useRef(pathname);

  useEffect(() => {
    latestPathnameRef.current = pathname;
  }, [pathname]);

  // Launch-intent navigation (share intents, notification recovery, stale
  // initial routes) is orchestrated one level up in the (app) Stack layout
  // (src/navigation/launch-route-orchestrator.tsx). This layout only owns
  // tab concerns and the tabs-ready signal.
  useEffect(() => {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: "Tabs layout mounted",
      level: "info",
      data: { pathname: latestPathnameRef.current },
    });
    signalTabsReady();
    return () => {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Tabs layout unmounted",
        level: "info",
        data: { pathname: latestPathnameRef.current },
      });
      signalTabsUnmounted();
    };
  }, []);

  return (
    <ScrollAnimationProvider>
      <SideMenuProvider>
        <TabsContent />
      </SideMenuProvider>
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
    borderTopWidth: RNStyleSheet.hairlineWidth,
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
  },
  tabItemInner: {
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
