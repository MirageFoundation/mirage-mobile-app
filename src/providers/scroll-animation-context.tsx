import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RefreshTargetRegistry,
  type RefreshTargetCallback,
  type RefreshTargetKey,
} from "./refresh-target-registry";

const HEADER_HEIGHT = 44;
const FEED_TAB_BAR_HEIGHT = 44;
const TAB_BAR_HEIGHT = 56;
const SCROLL_THRESHOLD = 50;
const HIDE_THRESHOLD = 10;
const SHOW_THRESHOLD = 15;
// Per-event diff cap: real flings rarely exceed ~150px per scroll event.
// Larger jumps almost always come from list re-layout (FlashList recycling
// adjusts the scroll offset when measured row heights differ from the
// estimated item size) or tab/page switches. We ignore those for the
// hide/show accounting so they don't toggle the bars unintentionally.
const MAX_LEGIT_DIFF = 150;
// Minimum time between bar visibility transitions. Stops the
// header/tab-bar/new-posts-button from flickering when FlashList emits
// rapid back-and-forth scroll events while a pagination footer / new
// page is rendering.
const TRANSITION_LOCKOUT_MS = 350;

type ScrollAnimationContextType = {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  headerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  tabBarAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  subTabBarAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  headerTranslateY: SharedValue<number>;
  tabBarTranslateY: SharedValue<number>;
  scrollY: SharedValue<number>;
  scrollOffsetY: SharedValue<number>;
  registerRefreshTarget: (
    key: RefreshTargetKey,
    callback: RefreshTargetCallback,
  ) => () => void;
  scrollToTopAndRefresh: (key: RefreshTargetKey) => Promise<void>;
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
  const scrollOffsetY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const tabBarTranslateY = useSharedValue(0);
  const isHidden = useSharedValue(false);
  const isProgrammaticScroll = useSharedValue(false);
  const isFirstScroll = useSharedValue(true);
  const accumulatedDist = useSharedValue(0);
  const lastDir = useSharedValue(0);
  const lastTransitionAt = useSharedValue(0);
  // Tracks whether the user is actively interacting with the scroll
  // surface (finger down or fling in flight). Scroll events that arrive
  // when this is false are layout-driven (footer/skeleton render, page
  // insert, recycling) and must not toggle the bars.
  const isUserScrolling = useSharedValue(false);

  const refreshTargetRegistryRef = useRef<RefreshTargetRegistry | null>(null);
  if (!refreshTargetRegistryRef.current) {
    refreshTargetRegistryRef.current = new RefreshTargetRegistry();
  }

  const fullHeaderHeight = HEADER_HEIGHT + insets.top;
  const fullTabBarHeight = TAB_BAR_HEIGHT + insets.bottom;

  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      isUserScrolling.value = true;
    },
    onMomentumBegin: () => {
      isUserScrolling.value = true;
    },
    onEndDrag: (event) => {
      // If the touch ends without throwing a fling, momentum won't begin,
      // so the bar logic must release here.
      const v = event?.velocity?.y ?? 0;
      if (Math.abs(v) < 0.1) {
        isUserScrolling.value = false;
      }
    },
    onMomentumEnd: () => {
      isUserScrolling.value = false;
    },
    onScroll: (event) => {
      const currentY = event.contentOffset.y;

      // Always-accurate scroll offset for consumers that must know the real
      // list position (e.g. the Android pull-to-refresh gate). Unlike
      // `lastScrollY`, this is updated on every scroll event and is never
      // reset by `showBars()`, so it cannot momentarily read 0 while the
      // list is still scrolled mid-feed.
      scrollOffsetY.value = currentY;

      if (isFirstScroll.value) {
        isFirstScroll.value = false;
        lastScrollY.value = currentY;
        return;
      }

      const diff = currentY - lastScrollY.value;
      lastScrollY.value = currentY;

      if (diff === 0) return;

      // Only react to scroll events while the user is actively driving
      // the scroll. Outside that window the events come from layout
      // (footer skeleton, page insert, recycling) and would otherwise
      // toggle the bars.
      if (!isUserScrolling.value) return;

      const absDiff = Math.abs(diff);
      // Belt-and-braces: skip oversized jumps too.
      if (absDiff > MAX_LEGIT_DIFF) return;

      const now = Date.now();

      const dir = diff > 0 ? 1 : -1;
      if (dir !== lastDir.value) {
        accumulatedDist.value = 0;
        lastDir.value = dir;
      }
      accumulatedDist.value = accumulatedDist.value + Math.abs(diff);

      const sinceLastTransition = now - lastTransitionAt.value;

      if (dir === 1 && currentY > SCROLL_THRESHOLD && !isHidden.value) {
        if (isProgrammaticScroll.value) return;
        if (
          accumulatedDist.value > HIDE_THRESHOLD &&
          sinceLastTransition > TRANSITION_LOCKOUT_MS
        ) {
          headerTranslateY.value = withTiming(-fullHeaderHeight, {
            duration: 200,
          });
          tabBarTranslateY.value = withTiming(fullTabBarHeight, {
            duration: 200,
          });
          isHidden.value = true;
          accumulatedDist.value = 0;
          lastTransitionAt.value = now;
        }
      } else if (dir === -1 && isHidden.value) {
        if (
          accumulatedDist.value > SHOW_THRESHOLD &&
          sinceLastTransition > TRANSITION_LOCKOUT_MS
        ) {
          headerTranslateY.value = withTiming(0, { duration: 200 });
          tabBarTranslateY.value = withTiming(0, { duration: 200 });
          isHidden.value = false;
          accumulatedDist.value = 0;
          lastTransitionAt.value = now;
        }
      }
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
    lastTransitionAt.value = Date.now();
    isUserScrolling.value = false;
    isProgrammaticScroll.value = true;
    setTimeout(() => {
      isProgrammaticScroll.value = false;
    }, 2000);
  }, [headerTranslateY, tabBarTranslateY, isUserScrolling, isHidden, isFirstScroll, lastScrollY, lastTransitionAt, isProgrammaticScroll]);

  const registerRefreshTarget = useCallback((
    key: RefreshTargetKey,
    callback: RefreshTargetCallback,
  ) => refreshTargetRegistryRef.current!.register(key, callback), []);

  const scrollToTopAndRefresh = useCallback(async (key: RefreshTargetKey) => {
    showBars();
    await refreshTargetRegistryRef.current!.invoke(key);
  }, [showBars]);

  const value = useMemo(
    () => ({
      scrollHandler,
      headerAnimatedStyle,
      tabBarAnimatedStyle,
      subTabBarAnimatedStyle: headerAnimatedStyle,
      headerTranslateY,
      tabBarTranslateY,
      scrollY: lastScrollY,
      scrollOffsetY,
      registerRefreshTarget,
      scrollToTopAndRefresh,
      showBars,
    }),
    [
      scrollHandler,
      headerAnimatedStyle,
      tabBarAnimatedStyle,
      headerTranslateY,
      tabBarTranslateY,
      lastScrollY,
      scrollOffsetY,
      registerRefreshTarget,
      scrollToTopAndRefresh,
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

export const useScrollY = (): SharedValue<number> | null => {
  const context = useContext(ScrollAnimationContext);
  return context?.scrollY ?? null;
};

export { HEADER_HEIGHT, TAB_BAR_HEIGHT };
export { FEED_TAB_BAR_HEIGHT };
export type { RefreshTargetKey } from "./refresh-target-registry";
