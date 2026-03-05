import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import type { FlatList, ScrollView } from "react-native";
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HEADER_HEIGHT = 44;
const FEED_TAB_BAR_HEIGHT = 44;
const TAB_BAR_HEIGHT = 56;
const SCROLL_THRESHOLD = 50;

type ScrollableRef = FlatList<any> | ScrollView | null;

type ScrollAnimationContextType = {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  headerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  tabBarAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  subTabBarAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  headerTranslateY: SharedValue<number>;
  tabBarTranslateY: SharedValue<number>;
  registerHomeRefresh: (callback: () => void) => void;
  registerFollowingRefresh: (callback: () => void) => void;
  registerProfileRefresh: (callback: () => void) => void;
  scrollToTopAndRefresh: () => void;
  scrollToTopAndRefreshFollowing: () => void;
  scrollToTopAndRefreshProfile: () => void;
  showBars: () => void;
};

const ScrollAnimationContext = createContext<ScrollAnimationContextType | null>(
  null
);

export const ScrollAnimationProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  const lastScrollY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const tabBarTranslateY = useSharedValue(0);
  const isHidden = useSharedValue(false);
  const isProgrammaticScroll = useSharedValue(false);
  const isFirstScroll = useSharedValue(true);

  const homeRefreshRef = useRef<(() => void) | null>(null);
  const followingRefreshRef = useRef<(() => void) | null>(null);
  const profileRefreshRef = useRef<(() => void) | null>(null);

  const fullHeaderHeight = HEADER_HEIGHT + insets.top;
  const fullTabBarHeight = TAB_BAR_HEIGHT + insets.bottom;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;

      if (isFirstScroll.value) {
        isFirstScroll.value = false;
        lastScrollY.value = currentY;
        return;
      }

      const diff = currentY - lastScrollY.value;

      if (diff > 0 && currentY > SCROLL_THRESHOLD && !isHidden.value) {
        if (isProgrammaticScroll.value) {
          lastScrollY.value = currentY;
          return;
        }
        headerTranslateY.value = withTiming(-fullHeaderHeight, {
          duration: 200,
        });
        tabBarTranslateY.value = withTiming(fullTabBarHeight, {
          duration: 200,
        });
        isHidden.value = true;
      } else if (diff < -5 && isHidden.value) {
        headerTranslateY.value = withTiming(0, { duration: 200 });
        tabBarTranslateY.value = withTiming(0, { duration: 200 });
        isHidden.value = false;
      }

      lastScrollY.value = currentY;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const tabBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarTranslateY.value }],
  }));

  const showBars = useCallback(() => {
    headerTranslateY.value = withTiming(0, { duration: 200 });
    tabBarTranslateY.value = withTiming(0, { duration: 200 });
    isHidden.value = false;
    isFirstScroll.value = true;
    lastScrollY.value = 0;
    isProgrammaticScroll.value = true;
    setTimeout(() => {
      isProgrammaticScroll.value = false;
    }, 2000);
  }, [headerTranslateY, tabBarTranslateY]);

  const registerHomeRefresh = useCallback((callback: () => void) => {
    homeRefreshRef.current = callback;
  }, []);

  const registerFollowingRefresh = useCallback((callback: () => void) => {
    followingRefreshRef.current = callback;
  }, []);

  const registerProfileRefresh = useCallback((callback: () => void) => {
    profileRefreshRef.current = callback;
  }, []);

  const scrollToTopAndRefresh = useCallback(() => {
    showBars();
    homeRefreshRef.current?.();
  }, [showBars]);

  const scrollToTopAndRefreshFollowing = useCallback(() => {
    showBars();
    followingRefreshRef.current?.();
  }, [showBars]);

  const scrollToTopAndRefreshProfile = useCallback(() => {
    showBars();
    profileRefreshRef.current?.();
  }, [showBars]);

  const value = useMemo(
    () => ({
      scrollHandler,
      headerAnimatedStyle,
      tabBarAnimatedStyle,
      subTabBarAnimatedStyle: headerAnimatedStyle,
      headerTranslateY,
      tabBarTranslateY,
      registerHomeRefresh,
      registerFollowingRefresh,
      registerProfileRefresh,
      scrollToTopAndRefresh,
      scrollToTopAndRefreshFollowing,
      scrollToTopAndRefreshProfile,
      showBars,
    }),
    [
      scrollHandler,
      headerAnimatedStyle,
      tabBarAnimatedStyle,
      headerTranslateY,
      tabBarTranslateY,
      registerHomeRefresh,
      registerFollowingRefresh,
      registerProfileRefresh,
      scrollToTopAndRefresh,
      scrollToTopAndRefreshFollowing,
      scrollToTopAndRefreshProfile,
      showBars,
    ]
  );

  return (
    <ScrollAnimationContext.Provider value={value}>
      {children}
    </ScrollAnimationContext.Provider>
  );
};

export const useScrollAnimationContext = () => {
  const context = useContext(ScrollAnimationContext);
  if (!context) {
    throw new Error(
      "useScrollAnimationContext must be used within a ScrollAnimationProvider"
    );
  }
  return context;
};

export { HEADER_HEIGHT, TAB_BAR_HEIGHT };
export { FEED_TAB_BAR_HEIGHT };
