import { useCallback, useState, type RefObject } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type UsePostDetailStickyHeaderParams = {
  currentScrollYRef: RefObject<number>;
};

export function usePostDetailStickyHeader({
  currentScrollYRef,
}: UsePostDetailStickyHeaderParams) {
  const [postHeaderHeight, setPostHeaderHeight] = useState(0);
  const stickyHeaderVisible = useSharedValue(0);
  const [isStickyInteractive, setIsStickyInteractive] = useState(false);
  const [isVideoVisible, setIsVideoVisible] = useState(true);

  const handlePostHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setPostHeaderHeight((current) =>
      Math.abs(current - nextHeight) < 1 ? current : nextHeight,
    );
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      currentScrollYRef.current = scrollY;
      const threshold = postHeaderHeight - 50;

      if (scrollY > threshold && stickyHeaderVisible.value === 0) {
        stickyHeaderVisible.value = withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        });
      } else if (scrollY <= threshold && stickyHeaderVisible.value === 1) {
        stickyHeaderVisible.value = withTiming(0, {
          duration: 250,
          easing: Easing.in(Easing.cubic),
        });
      }

      const videoVisible = postHeaderHeight > 0 ? scrollY < postHeaderHeight : true;
      setIsVideoVisible((prev) => prev === videoVisible ? prev : videoVisible);
    },
    [currentScrollYRef, postHeaderHeight, stickyHeaderVisible],
  );

  useAnimatedReaction(
    () => stickyHeaderVisible.value > 0.5,
    (next, prev) => {
      if (next === prev) return;
      runOnJS(setIsStickyInteractive)(next);
    },
  );

  const stickyHeaderAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(stickyHeaderVisible.value, [0, 1], [-60, 0]);
    const opacity = interpolate(stickyHeaderVisible.value, [0, 1], [0, 1]);

    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  return {
    handlePostHeaderLayout,
    handleScroll,
    isStickyInteractive,
    isVideoVisible,
    stickyHeaderAnimatedStyle,
  };
}
