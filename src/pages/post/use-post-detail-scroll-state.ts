import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
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

import { getLastPressedPostY } from "@/src/utils/post-transition";

export function usePostDetailScrollState(topInset: number) {
  const pressedY = useMemo(() => getLastPressedPostY(), []);
  const headerHeight = topInset + 40;
  const initialTranslateY = pressedY > 0 ? pressedY - headerHeight : 0;

  const postTranslateY = useSharedValue(initialTranslateY);
  const postOpacity = useSharedValue(pressedY > 0 ? 0 : 1);
  const stickyHeaderVisible = useSharedValue(0);

  const [postHeaderHeight, setPostHeaderHeight] = useState(0);
  const [isStickyInteractive, setIsStickyInteractive] = useState(false);
  const [isVideoVisible, setIsVideoVisible] = useState(true);

  useEffect(() => {
    if (pressedY > 0) {
      postOpacity.value = withTiming(1, { duration: 200 });
      postTranslateY.value = withTiming(0, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [postOpacity, postTranslateY, pressedY]);

  const postEnteringStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: postTranslateY.value }],
    opacity: postOpacity.value,
  }));

  const handlePostHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setPostHeaderHeight((current) =>
      Math.abs(current - nextHeight) < 1 ? current : nextHeight,
    );
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = event.nativeEvent.contentOffset.y;
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
      setIsVideoVisible((prev) => (prev === videoVisible ? prev : videoVisible));
    },
    [postHeaderHeight, stickyHeaderVisible],
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
    postEnteringStyle,
    stickyHeaderAnimatedStyle,
  };
}
