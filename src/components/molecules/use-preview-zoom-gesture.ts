import { useCallback } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

function clampTranslation(value: number, extent: number, scale: number): number {
  "worklet";
  // With a centered transform origin, a container scaled by `s` can shift at
  // most (extent * (s - 1)) / 2 in each direction before its edge crosses the
  // matching viewport edge.
  const max = Math.max(0, (extent * (scale - 1)) / 2);
  return Math.min(max, Math.max(-max, value));
}

/**
 * Pinch/pan/double-tap zoom for the fullscreen image preview: pinch scales
 * (clamped 1–4x), pan moves the zoomed image within bounds, double-tap
 * toggles 1x/2x, and shrinking below 1x snaps everything back.
 *
 * Pan is clamped so the scaled container can never be dragged fully
 * off-screen (BUG-007: infinite pan into a blank screen; BUG-008: vertical
 * drag flinging the image away entirely).
 */
export function usePreviewZoomGesture(
  containerWidth: number,
  containerHeight: number,
) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransforms = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      if (scale.value > 4) {
        scale.value = withTiming(4);
        savedScale.value = 4;
      } else {
        savedScale.value = scale.value;
      }
      // Zooming out can leave the previous translation outside the new
      // pannable range; settle back into bounds.
      const settledScale = savedScale.value;
      const clampedX = clampTranslation(translateX.value, containerWidth, settledScale);
      const clampedY = clampTranslation(translateY.value, containerHeight, settledScale);
      if (clampedX !== translateX.value) translateX.value = withTiming(clampedX);
      if (clampedY !== translateY.value) translateY.value = withTiming(clampedY);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = clampTranslation(
          savedTranslateX.value + e.translationX,
          containerWidth,
          savedScale.value,
        );
        translateY.value = clampTranslation(
          savedTranslateY.value + e.translationY,
          containerHeight,
          savedScale.value,
        );
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return { composedGesture, animatedStyle, resetTransforms };
}
