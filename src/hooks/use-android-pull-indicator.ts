import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const TOP_TOLERANCE = 12;
const ACTIVATE_DISTANCE = 2;
const HORIZONTAL_FAIL_DISTANCE = 24;
const TRIGGER_DISTANCE = 56;
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
  const didTriggerRefresh = useSharedValue(false);

  useEffect(() => {
    refreshingValue.value = refreshing;

    if (refreshing) {
      pullDistance.value = TRIGGER_DISTANCE;
      return;
    }

    didTriggerRefresh.value = false;
    pullDistance.value = withTiming(0, { duration: RESET_DURATION });
  }, [didTriggerRefresh, pullDistance, refreshing, refreshingValue]);

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

        if (!refreshingValue.value) {
          didTriggerRefresh.value = false;
          pullDistance.value = 0;
        }
      })
      .onTouchesMove((event, stateManager) => {
        if (refreshingValue.value) {
          pullDistance.value = TRIGGER_DISTANCE;
          return;
        }

        const touch = event.allTouches[0];
        if (!touch) return;

        const dx = touch.absoluteX - startX.value;
        const dy = touch.absoluteY - startY.value;
        const isAtTop = scrollY.value <= TOP_TOLERANCE;
        const isMostlyHorizontal =
          Math.abs(dx) > HORIZONTAL_FAIL_DISTANCE
          && Math.abs(dx) > Math.abs(dy) * 1.2;

        if (isMostlyHorizontal) {
          pullDistance.value = withTiming(0, { duration: RESET_DURATION });
          stateManager.fail();
          return;
        }

        if (!isAtTop) {
          pullDistance.value = 0;
          stateManager.fail();
          return;
        }

        if (dy <= 0) {
          pullDistance.value = 0;
          return;
        }

        pullDistance.value = Math.min(dy, MAX_PULL_DISTANCE);

        if (dy >= ACTIVATE_DISTANCE) {
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
      .onTouchesUp((_event) => {
        if (refreshingValue.value) {
          pullDistance.value = TRIGGER_DISTANCE;
          return;
        }

        if (didTriggerRefresh.value) return;

        if (pullDistance.value >= TRIGGER_DISTANCE) {
          didTriggerRefresh.value = true;
          pullDistance.value = TRIGGER_DISTANCE;
          runOnJS(onTriggerRefresh)();
          return;
        }

        pullDistance.value = withTiming(0, { duration: RESET_DURATION });
      })
      .onTouchesCancelled(() => {
        if (refreshingValue.value || didTriggerRefresh.value) return;
        pullDistance.value = withTiming(0, { duration: RESET_DURATION });
      })
      .onFinalize(() => {
        if (refreshingValue.value) {
          pullDistance.value = TRIGGER_DISTANCE;
          return;
        }

        if (!didTriggerRefresh.value) {
          pullDistance.value = withTiming(0, { duration: RESET_DURATION });
        }
      }),
    [
      didTriggerRefresh,
      enabled,
      onTriggerRefresh,
      pullDistance,
      refreshingValue,
      scrollY,
      startX,
      startY,
    ],
  );

  return {
    pullDistance,
    pullGesture,
  };
}
