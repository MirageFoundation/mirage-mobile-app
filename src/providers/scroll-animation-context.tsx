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
const TAB_BAR_HEIGHT = 56;
const SCROLL_THRESHOLD = 50;

type ScrollableRef = FlatList<any> | ScrollView | null;

type ScrollAnimationContextType = {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  headerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  tabBarAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  headerTranslateY: SharedValue<number>;
  tabBarTranslateY: SharedValue<number>;
  registerScrollRef: (ref: ScrollableRef) => void;
  registerRefreshCallback: (callback: () => void) => void;
  scrollToTopAndRefresh: () => void;
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

  // Refs for scroll-to-top functionality
  const scrollRef = useRef<ScrollableRef>(null);
  const refreshCallbackRef = useRef<(() => void) | null>(null);

  // Calculate full heights including safe areas
  const fullHeaderHeight = HEADER_HEIGHT + insets.top;
  const fullTabBarHeight = TAB_BAR_HEIGHT + insets.bottom;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;

      if (diff > 0 && currentY > SCROLL_THRESHOLD) {
        // Scrolling down - hide completely
        headerTranslateY.value = withTiming(-fullHeaderHeight, {
          duration: 200,
        });
        tabBarTranslateY.value = withTiming(fullTabBarHeight, {
          duration: 200,
        });
      } else if (diff < -5) {
        // Scrolling up - show
        headerTranslateY.value = withTiming(0, { duration: 200 });
        tabBarTranslateY.value = withTiming(0, { duration: 200 });
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

  // Register scroll ref from screens
  const registerScrollRef = useCallback((ref: ScrollableRef) => {
    scrollRef.current = ref;
  }, []);

  // Register refresh callback from screens
  const registerRefreshCallback = useCallback((callback: () => void) => {
    refreshCallbackRef.current = callback;
  }, []);

  // Scroll to top and trigger refresh
  const scrollToTopAndRefresh = useCallback(() => {
    // Show header and tab bar
    headerTranslateY.value = withTiming(0, { duration: 200 });
    tabBarTranslateY.value = withTiming(0, { duration: 200 });

    // Scroll to top
    if (scrollRef.current) {
      if ("scrollToOffset" in scrollRef.current) {
        // FlatList
        scrollRef.current.scrollToOffset({ offset: 0, animated: true });
      } else if ("scrollTo" in scrollRef.current) {
        // ScrollView
        scrollRef.current.scrollTo({ y: 0, animated: true });
      }
    }

    // Trigger refresh
    if (refreshCallbackRef.current) {
      refreshCallbackRef.current();
    }
  }, [headerTranslateY, tabBarTranslateY]);

  const value = useMemo(
    () => ({
      scrollHandler,
      headerAnimatedStyle,
      tabBarAnimatedStyle,
      headerTranslateY,
      tabBarTranslateY,
      registerScrollRef,
      registerRefreshCallback,
      scrollToTopAndRefresh,
    }),
    [
      scrollHandler,
      headerAnimatedStyle,
      tabBarAnimatedStyle,
      headerTranslateY,
      tabBarTranslateY,
      registerScrollRef,
      registerRefreshCallback,
      scrollToTopAndRefresh,
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
