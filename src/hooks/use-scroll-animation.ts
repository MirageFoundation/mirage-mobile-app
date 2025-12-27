import { useSharedValue, useAnimatedStyle, withTiming, useAnimatedScrollHandler } from "react-native-reanimated";

const HEADER_HEIGHT = 56;
const TAB_BAR_HEIGHT = 60;
const SCROLL_THRESHOLD = 50;

export const useScrollAnimation = () => {
  const scrollY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const tabBarTranslateY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;

      if (diff > 0 && currentY > SCROLL_THRESHOLD) {
        // Scrolling down - hide header and tab bar
        headerTranslateY.value = withTiming(-HEADER_HEIGHT, { duration: 200 });
        tabBarTranslateY.value = withTiming(TAB_BAR_HEIGHT, { duration: 200 });
      } else if (diff < -5) {
        // Scrolling up - show header and tab bar
        headerTranslateY.value = withTiming(0, { duration: 200 });
        tabBarTranslateY.value = withTiming(0, { duration: 200 });
      }

      lastScrollY.value = currentY;
      scrollY.value = currentY;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const tabBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarTranslateY.value }],
  }));

  return {
    scrollY,
    scrollHandler,
    headerAnimatedStyle,
    tabBarAnimatedStyle,
    headerTranslateY,
    tabBarTranslateY,
  };
};

export { HEADER_HEIGHT, TAB_BAR_HEIGHT };

