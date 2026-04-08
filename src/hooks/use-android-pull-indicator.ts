import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const TOP_TOLERANCE = 2;
const ACTIVATE_DISTANCE = 4;
const HORIZONTAL_FAIL_DISTANCE = 12;
const TRIGGER_DISTANCE = 60;
const MAX_PULL_DISTANCE = 120;
const RESET_DURATION = 120;

type UseAndroidPullIndicatorOptions = {
  scrollY: SharedValue<number>;
  refreshing: boolean;
  onTriggerRefresh: () => void;
  enabled?: boolean;
};

export function useAndroidPullIndicator({
  scrollY,
  refreshing,
  onTriggerRefresh,
  enabled = Platform.OS === "android",
}: UseAndroidPullIndicatorOptions) {
  const pullDistance = useSharedValue(0);
  const refreshingValue = useSharedValue(refreshing);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    refreshingValue.value = refreshing;
    if (!refreshing) {
      pullDistance.value = withTiming(0, { duration: RESET_DURATION });
    }
  }, [pullDistance, refreshing, refreshingValue]);

  const pullGesture = useMemo(
    () => Gesture.Pan()
      .enabled(enabled)
      .manualActivation(true)
      .shouldCancelWhenOutside(false)
      .onTouchesDown((event) => {
        const touch = event.allTouches[0];
        if (!touch) return;
        startX.value = touch.absoluteX;
        startY.value = touch.absoluteY;
      })
      .onTouchesMove((event, stateManager) => {
        if (refreshingValue.value) {
          stateManager.fail();
          return;
        }

        const touch = event.allTouches[0];
        if (!touch) return;

        const dx = touch.absoluteX - startX.value;
        const dy = touch.absoluteY - startY.value;

        if (Math.abs(dx) > HORIZONTAL_FAIL_DISTANCE) {
          stateManager.fail();
          return;
        }

        if (
          scrollY.value <= TOP_TOLERANCE
          && dy > ACTIVATE_DISTANCE
          && dy > Math.abs(dx)
        ) {
          stateManager.activate();
        }
      })
      .onUpdate((event) => {
        if (refreshingValue.value) {
          pullDistance.value = TRIGGER_DISTANCE;
          return;
        }

        pullDistance.value = Math.min(
          Math.max(0, event.translationY),
          MAX_PULL_DISTANCE,
        );
      })
      .onEnd(() => {
        if (refreshingValue.value) return;

        const shouldRefresh = pullDistance.value >= TRIGGER_DISTANCE;
        if (shouldRefresh) {
          pullDistance.value = TRIGGER_DISTANCE;
          runOnJS(onTriggerRefresh)();
          return;
        }

        pullDistance.value = withTiming(0, { duration: RESET_DURATION });
      })
      .onFinalize(() => {
        if (!refreshingValue.value && pullDistance.value < TRIGGER_DISTANCE) {
          pullDistance.value = withTiming(0, { duration: RESET_DURATION });
        }
      }),
    [enabled, onTriggerRefresh, pullDistance, refreshingValue, scrollY, startX, startY],
  );

  return {
    pullDistance,
    pullGesture,
  };
}
