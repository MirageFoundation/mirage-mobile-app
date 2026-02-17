import { useCallback } from "react";
import { Dimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TAB_COUNT = 3;
const VELOCITY_THRESHOLD = 500;

export function useTabSwipeGesture({
  onTabChange,
  animatedIndex,
  tabCount = TAB_COUNT,
}: {
  onTabChange: (index: number) => void;
  animatedIndex: SharedValue<number>;
  tabCount?: number;
}) {
  const startTab = useSharedValue(0);
  const contentTranslateX = useSharedValue(0);
  const fadeOpacity = useSharedValue(1);
  const isGestureActive = useSharedValue(false);

  const completeTransition = useCallback(
    (targetTab: number) => {
      contentTranslateX.value = 0;
      onTabChange(targetTab);
      setTimeout(() => {
        fadeOpacity.value = withTiming(1, { duration: 180 });
      }, 50);
    },
    [onTabChange, contentTranslateX, fadeOpacity],
  );

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onStart(() => {
      startTab.value = Math.round(animatedIndex.value);
      isGestureActive.value = true;
      fadeOpacity.value = 1;
    })
    .onUpdate((event) => {
      const progress = -event.translationX / SCREEN_WIDTH;
      const newIndex = startTab.value + progress;
      const clampedIndex = Math.max(0, Math.min(tabCount - 1, newIndex));
      animatedIndex.value = clampedIndex;
      contentTranslateX.value =
        -(clampedIndex - startTab.value) * SCREEN_WIDTH;
    })
    .onEnd((event) => {
      isGestureActive.value = false;
      const velocity = event.velocityX;

      let targetTab: number;
      if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
        targetTab =
          velocity < 0
            ? Math.min(startTab.value + 1, tabCount - 1)
            : Math.max(startTab.value - 1, 0);
      } else {
        targetTab = Math.round(animatedIndex.value);
      }
      targetTab = Math.max(0, Math.min(tabCount - 1, targetTab));

      animatedIndex.value = withTiming(targetTab, { duration: 200 });

      if (targetTab === startTab.value) {
        contentTranslateX.value = withTiming(0, { duration: 200 });
      } else {
        const direction = targetTab > startTab.value ? -1 : 1;
        contentTranslateX.value = withTiming(
          direction * SCREEN_WIDTH,
          { duration: 120 },
          (finished) => {
            if (finished) {
              fadeOpacity.value = 0;
              runOnJS(completeTransition)(targetTab);
            }
          },
        );
      }
    });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const gestureOpacity = interpolate(
      Math.abs(contentTranslateX.value),
      [0, SCREEN_WIDTH * 0.5, SCREEN_WIDTH],
      [1, 0.3, 0],
      "clamp",
    );
    return {
      transform: [{ translateX: contentTranslateX.value }],
      opacity: Math.min(gestureOpacity, fadeOpacity.value),
    };
  });

  return {
    swipeGesture,
    contentTranslateX,
    contentAnimatedStyle,
    fadeOpacity,
    completeTransition,
    isGestureActive,
  };
}
