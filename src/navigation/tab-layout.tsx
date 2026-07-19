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
import { useDeepLinkStore } from "@/src/stores/deep-link-store";
import { useInboxStore } from "@/src/stores/inbox-store";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { useShareIntentContext } from "expo-share-intent";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname } from "expo-router";
import { router, replaceBypass } from "@/src/navigation/guarded-router";
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
  isInboxNotificationNavigationActive,
  isShareIntentNavigationActive,
  markShareIntentNavigationActive,
  signalTabsReady,
  signalTabsUnmounted,
} from "@/src/services/inbox-notifications";
import {
  isRecentCreateDeepLink,
  isRecentInitialTabDeepLink,
  isRecentSharePath,
} from "@/src/navigation/linking";
import { getPendingShareIntent } from "@/src/navigation/pending-launch-intents";

// Tabs that require authentication
const PROTECTED_TABS = ["following", "create", "inbox", "profile"];

function getPendingShareIntentDiagnostics() {
  const pending = getPendingShareIntent();
  if (!pending) {
    return { hasPendingShareIntent: false };
  }

  return {
    hasPendingShareIntent: true,
    pendingShareIntentAgeMs: Date.now() - pending.receivedAt,
    pendingShareIntentSource: pending.source,
    pendingShareIntentType: pending.type,
    pendingHasText: !!pending.text,
    pendingHasWebUrl: !!pending.webUrl,
    pendingFileCount: pending.files?.length ?? 0,
    pendingHasLaunchPath: !!pending.launchPath,
  };
}

const AnimatedTabBar = ({ state, descriptors, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const {
    tabBarAnimatedStyle,
    scrollToTopAndRefresh,
    scrollToTopAndRefreshFollowing,
    scrollToTopAndRefreshProfile,
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
    const homePostCardStore = useHomePostCardStore.getState();
    if (pathname === "/" || pathname.endsWith("/(tabs)") || pathname.endsWith("/(tabs)/") || pathname.endsWith("/index")) {
      homePostCardStore.setActiveFeedScreen("home");
      homePostCardStore.setVideoViewability("following:magic", new Set(), null);
      homePostCardStore.setVideoViewability("following:latest", new Set(), null);
      Sentry.addBreadcrumb({
        category: "feed-video",
        message: "Activated home feed playback",
        level: "info",
        data: { pathname },
      });
    } else if (pathname.endsWith("/following")) {
      homePostCardStore.setActiveFeedScreen("following");
      homePostCardStore.setVideoViewability("home:magic", new Set(), null);
      homePostCardStore.setVideoViewability("home:latest", new Set(), null);
      Sentry.addBreadcrumb({
        category: "feed-video",
        message: "Activated following feed playback",
        level: "info",
        data: { pathname },
      });
    } else if (!pathname.startsWith("/topic/")) {
      homePostCardStore.setActiveFeedScreen(null);
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
  const { hasShareIntent } = useShareIntentContext();
  const hasHandledInitialRouteRef = useRef(false);
  const initialShareIntentRef = useRef(hasShareIntent);
  const latestPathnameRef = useRef(pathname);
  const latestShareIntentRef = useRef(hasShareIntent);

  useEffect(() => {
    latestPathnameRef.current = pathname;
    latestShareIntentRef.current = hasShareIntent;
  }, [pathname, hasShareIntent]);

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: "Tabs layout mounted",
      level: "info",
      data: { pathname: latestPathnameRef.current, hasShareIntent: latestShareIntentRef.current },
    });
    signalTabsReady();
    return () => {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Tabs layout unmounted",
        level: "info",
        data: { pathname: latestPathnameRef.current, hasShareIntent: latestShareIntentRef.current },
      });
      signalTabsUnmounted();
    };
  }, []);

  const prevShareIntentRef = useRef(hasShareIntent);
  const hasForcedShareIntentRouteRef = useRef(false);
  useEffect(() => {
    const prev = prevShareIntentRef.current;
    prevShareIntentRef.current = hasShareIntent;
    if (!hasShareIntent) {
      hasForcedShareIntentRouteRef.current = false;
      return;
    }
    markShareIntentNavigationActive("tabs-share-intent");
    if (pathname.endsWith("/create")) {
      hasForcedShareIntentRouteRef.current = true;
      return;
    }
    if (!hasForcedShareIntentRouteRef.current) {
      const hasRecentInitialTabDeepLink = isRecentInitialTabDeepLink();
      const isPostPath = pathname.startsWith("/post/");
      const isNotificationNavigationActive = isInboxNotificationNavigationActive();
      const activeShareRedirectDiagnostics = {
        pathname,
        hadPreviousShareIntent: prev,
        hasHandledInitialRoute: hasHandledInitialRouteRef.current,
        isNotificationNavigationActive,
        hasForcedShareIntentRoute: hasForcedShareIntentRouteRef.current,
        hasRecentInitialTabDeepLink,
        isPostPath,
        detectedRecentSharePath: isRecentSharePath(10_000),
        ...getPendingShareIntentDiagnostics(),
      };
      // Notification navigation owns the route while it is in flight. A share
      // intent replayed by Android (cold start, activity recreation) must not
      // steal the screen and strand the user on Create.
      if (isNotificationNavigationActive) {
        Sentry.captureMessage("Share intent create redirect blocked during notification navigation", {
          level: "warning",
          tags: {
            feature: "share-intent",
            operation: "create-redirect-blocked",
          },
          extra: activeShareRedirectDiagnostics,
        });
        return;
      }
      // An active post deep link also outranks a replayed share intent.
      if (isPostPath || hasRecentInitialTabDeepLink) {
        Sentry.captureMessage("Share intent create redirect blocked by active deep link", {
          level: "warning",
          tags: {
            feature: "share-intent",
            operation: "create-redirect-blocked",
            route_kind: isPostPath ? "post" : "tab",
          },
          extra: activeShareRedirectDiagnostics,
        });
        return;
      }
      hasForcedShareIntentRouteRef.current = true;
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Forcing share intent to create tab",
        level: "info",
        data: activeShareRedirectDiagnostics,
      });
      replaceBypass("/(tabs)/create");
    } else {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Skipped repeated share intent create redirect",
        level: "info",
        data: { pathname, hadPreviousShareIntent: prev },
      });
    }
  }, [hasShareIntent, pathname]);

  useEffect(() => {
    if (hasHandledInitialRouteRef.current || !pathname) return;

    const handleInitial = () => {
      if (hasHandledInitialRouteRef.current) return;
      hasHandledInitialRouteRef.current = true;

      const pendingShareIntentDiagnostics = getPendingShareIntentDiagnostics();
      const hasPendingShareIntent = pendingShareIntentDiagnostics.hasPendingShareIntent;
      const hasInitialShareIntent =
        initialShareIntentRef.current ||
        hasShareIntent ||
        hasPendingShareIntent;
      const hasInitialCreateIntent =
        hasInitialShareIntent || isRecentCreateDeepLink();
      const hasInitialTabDeepLink = isRecentInitialTabDeepLink();
      const currentPathname = latestPathnameRef.current || pathname;
      const isOnHomeTab =
        currentPathname === "/" ||
        currentPathname.endsWith("/(tabs)") ||
        currentPathname.endsWith("/(tabs)/") ||
        currentPathname.endsWith("/index");
      const isOnCreate = currentPathname.endsWith("/create");
      const isOnInbox = currentPathname.endsWith("/inbox");
      const isOnPostDetail = currentPathname.startsWith("/post/");
      const pendingDeepLinkRoute = useDeepLinkStore.getState().pendingRoute;
      const pendingDeepLinkIsPost = pendingDeepLinkRoute?.startsWith("/post/") ?? false;
      const isOnNonHomeTab =
        isOnCreate ||
        isOnInbox ||
        currentPathname.endsWith("/following") ||
        currentPathname.endsWith("/profile");
      const isNotificationNavigationActive = isInboxNotificationNavigationActive();
      const isShareNavigationActive = isShareIntentNavigationActive();
      const initialRouteDiagnostics = {
        pathname: currentPathname,
        hasInitialCreateIntent,
        hasInitialShareIntent,
        hasInitialTabDeepLink,
        isOnHomeTab,
        isOnCreate,
        isOnInbox,
        isOnPostDetail,
        hasPendingDeepLinkRoute: !!pendingDeepLinkRoute,
        pendingDeepLinkIsPost,
        isOnNonHomeTab,
        isNotificationNavigationActive,
        isShareNavigationActive,
        hasShareIntent,
        hadInitialShareIntent: initialShareIntentRef.current,
        detectedRecentSharePath: isRecentSharePath(10_000),
        ...pendingShareIntentDiagnostics,
      };

      Sentry.addBreadcrumb({
        category: "navigation",
        message: "Initial tab route check",
        data: initialRouteDiagnostics,
        level: "info",
      });
      console.log("[InboxNotifFlow] tab initial route check", initialRouteDiagnostics);

      if (isNotificationNavigationActive && isOnPostDetail) {
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Tab initial route recovery skipped on notification post detail",
          level: "info",
          data: initialRouteDiagnostics,
        });
      }

      if (
        isNotificationNavigationActive &&
        !hasInitialShareIntent &&
        !isOnInbox &&
        !isOnPostDetail
      ) {
        console.log("[InboxNotifFlow] tab recovery replacing to inbox", {
          pathname: currentPathname,
          isNotificationNavigationActive,
          isShareNavigationActive,
        });
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Routing active notification launch to inbox tab",
          data: {
            pathname: currentPathname,
            isNotificationNavigationActive,
            isShareNavigationActive,
          },
          level: "info",
        });
        Sentry.captureMessage("Tab initial route recovery replacing to inbox", {
          level: "warning",
          tags: {
            feature: "inbox-notifications",
            operation: "tab-route-recovery-to-inbox",
          },
          extra: initialRouteDiagnostics,
        });
        replaceBypass("/(tabs)/inbox");
        return;
      }

      if (hasInitialShareIntent && !isOnCreate) {
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Routing initial share intent to create tab",
          data: {
            pathname: currentPathname,
            hasShareIntent,
            hasPendingShareIntent,
            hadInitialShareIntent: initialShareIntentRef.current,
            detectedRecentSharePath: isRecentSharePath(10_000),
          },
          level: "info",
        });
        if (isOnPostDetail || pendingDeepLinkIsPost || hasInitialTabDeepLink) {
          Sentry.captureMessage("Stale share intent may override initial deep link", {
            level: "warning",
            tags: {
              feature: "share-intent",
              operation: "initial-deep-link-overridden",
              route_kind: isOnPostDetail || pendingDeepLinkIsPost ? "post" : "tab",
            },
            extra: initialRouteDiagnostics,
          });
        }
        Sentry.captureMessage("Android share intent initial route recovery", {
          level: "info",
          tags: { feature: "share-intent", operation: "initial-route-recovery" },
          extra: {
            pathname: currentPathname,
            hasShareIntent,
            hasPendingShareIntent,
            hadInitialShareIntent: initialShareIntentRef.current,
            detectedRecentSharePath: isRecentSharePath(10_000),
          },
        });
        router.replace("/(tabs)/create");
      }

      if (
        isOnNonHomeTab &&
        !hasInitialTabDeepLink &&
        !hasInitialCreateIntent &&
        !isNotificationNavigationActive &&
        !isShareNavigationActive
      ) {
        Sentry.addBreadcrumb({
          category: "navigation",
          message: "Redirecting stale initial tab route to home",
          data: initialRouteDiagnostics,
          level: "warning",
        });
        Sentry.captureMessage("Unexpected initial non-home tab route recovered", {
          level: "warning",
          tags: {
            feature: "navigation",
            operation: "initial-tab-route-recovery",
            initial_tab_route: isOnCreate ? "create" : isOnInbox ? "inbox" : "other",
          },
          extra: initialRouteDiagnostics,
        });
        router.replace("/(tabs)");
      }
    };

    const timer = setTimeout(handleInitial, 800);

    return () => clearTimeout(timer);
  }, [pathname, hasShareIntent]);

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
