import React, { createContext, useContext, useMemo } from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";

const HEADER_HEIGHT = 56;
const TAB_BAR_HEIGHT = 60;
const SCROLL_THRESHOLD = 50;

type ScrollAnimationContextType = {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  headerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  tabBarAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  headerTranslateY: SharedValue<number>;
  tabBarTranslateY: SharedValue<number>;
};

const ScrollAnimationContext = createContext<ScrollAnimationContextType | null>(
  null
);

export const ScrollAnimationProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const lastScrollY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const tabBarTranslateY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;

      if (diff > 0 && currentY > SCROLL_THRESHOLD) {
        // Scrolling down - hide
        headerTranslateY.value = withTiming(-HEADER_HEIGHT, { duration: 200 });
        tabBarTranslateY.value = withTiming(TAB_BAR_HEIGHT, { duration: 200 });
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

  const value = useMemo(
    () => ({
      scrollHandler,
      headerAnimatedStyle,
      tabBarAnimatedStyle,
      headerTranslateY,
      tabBarTranslateY,
    }),
    [scrollHandler, headerAnimatedStyle, tabBarAnimatedStyle, headerTranslateY, tabBarTranslateY]
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

