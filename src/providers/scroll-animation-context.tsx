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
  // Following-specific
  registerFollowingScrollRef: (ref: ScrollableRef) => void;
  registerFollowingRefreshCallback: (callback: () => void) => void;
  scrollToTopAndRefreshFollowing: () => void;
  // Profile-specific
  registerProfileScrollRef: (ref: ScrollableRef) => void;
  registerProfileRefreshCallback: (callback: () => void) => void;
  scrollToTopAndRefreshProfile: () => void;
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

  // Refs for scroll-to-top functionality (home)
  const scrollRef = useRef<ScrollableRef>(null);
  const refreshCallbackRef = useRef<(() => void) | null>(null);

  // Refs for following scroll-to-top functionality
  const followingScrollRef = useRef<ScrollableRef>(null);
  const followingRefreshCallbackRef = useRef<(() => void) | null>(null);

  // Refs for profile scroll-to-top functionality
  const profileScrollRef = useRef<ScrollableRef>(null);
  const profileRefreshCallbackRef = useRef<(() => void) | null>(null);

  // Calculate full heights including safe areas
  const fullHeaderHeight = HEADER_HEIGHT + insets.top;
  const fullTabBarHeight = TAB_BAR_HEIGHT + insets.bottom;

 const scrollHandler = useAnimatedScrollHandler({
   onScroll: (event) => {
     const currentY = event.contentOffset.y;
     const diff = currentY - lastScrollY.value;

      if (diff > 0 && currentY > SCROLL_THRESHOLD && !isHidden.value) {
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
   headerTranslateY.value = withTiming(0, { duration: 200 });
   tabBarTranslateY.value = withTiming(0, { duration: 200 });
    isHidden.value = false;

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

  // Following-specific register and refresh functions
  const registerFollowingScrollRef = useCallback((ref: ScrollableRef) => {
    followingScrollRef.current = ref;
  }, []);

  const registerFollowingRefreshCallback = useCallback((callback: () => void) => {
    followingRefreshCallbackRef.current = callback;
  }, []);

 const scrollToTopAndRefreshFollowing = useCallback(() => {
   headerTranslateY.value = withTiming(0, { duration: 200 });
   tabBarTranslateY.value = withTiming(0, { duration: 200 });
    isHidden.value = false;

    if (followingScrollRef.current) {
      if ("scrollToOffset" in followingScrollRef.current) {
        followingScrollRef.current.scrollToOffset({ offset: 0, animated: true });
      } else if ("scrollTo" in followingScrollRef.current) {
        followingScrollRef.current.scrollTo({ y: 0, animated: true });
      }
    }

    if (followingRefreshCallbackRef.current) {
      followingRefreshCallbackRef.current();
    }
  }, [headerTranslateY, tabBarTranslateY]);

  // Profile-specific register and refresh functions
  const registerProfileScrollRef = useCallback((ref: ScrollableRef) => {
    profileScrollRef.current = ref;
  }, []);

  const registerProfileRefreshCallback = useCallback((callback: () => void) => {
    profileRefreshCallbackRef.current = callback;
  }, []);

 const scrollToTopAndRefreshProfile = useCallback(() => {
   headerTranslateY.value = withTiming(0, { duration: 200 });
   tabBarTranslateY.value = withTiming(0, { duration: 200 });
    isHidden.value = false;

    // Scroll to top
    if (profileScrollRef.current) {
      if ("scrollToOffset" in profileScrollRef.current) {
        // FlatList
        profileScrollRef.current.scrollToOffset({ offset: 0, animated: true });
      } else if ("scrollTo" in profileScrollRef.current) {
        // ScrollView
        profileScrollRef.current.scrollTo({ y: 0, animated: true });
      }
    }

    // Trigger refresh
    if (profileRefreshCallbackRef.current) {
      profileRefreshCallbackRef.current();
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
      registerFollowingScrollRef,
      registerFollowingRefreshCallback,
      scrollToTopAndRefreshFollowing,
      registerProfileScrollRef,
      registerProfileRefreshCallback,
      scrollToTopAndRefreshProfile,
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
      registerFollowingScrollRef,
      registerFollowingRefreshCallback,
      scrollToTopAndRefreshFollowing,
      registerProfileScrollRef,
      registerProfileRefreshCallback,
      scrollToTopAndRefreshProfile,
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
