import { useCallback, useEffect } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  clampZoomScale,
  clampZoomTranslation,
  MIN_ZOOM_SCALE,
} from "./preview-zoom-math";

/**
 * Pinch/pan/double-tap zoom for the fullscreen image preview: pinch scales
 * (clamped 1–4x), pan moves the zoomed image within the live scale's bounds,
 * double-tap toggles 1x/2x, and shrinking below 1x snaps everything back.
 *
 * Pan is clamped to the current scale on both axes so the scaled container
 * can never be dragged fully off-screen (BUG-004: infinite pan into a blank
 * screen; BUG-005: vertical drag flinging the image away entirely).
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
    scale.value = withTiming(MIN_ZOOM_SCALE);
    savedScale.value = MIN_ZOOM_SCALE;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  useEffect(() => {
    runOnUI((width: number, height: number) => {
      "worklet";
      translateX.value = clampZoomTranslation(translateX.value, width, scale.value);
      translateY.value = clampZoomTranslation(translateY.value, height, scale.value);
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })(containerWidth, containerHeight);
  }, [
    containerHeight,
    containerWidth,
    scale,
    savedTranslateX,
    savedTranslateY,
    translateX,
    translateY,
  ]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = savedScale.value * e.scale;
      scale.value = nextScale;
      // Zooming out shrinks the pannable range immediately; keep the image
      // covering the viewport even before the gesture settles. Rubber-band
      // scale still uses the settled 1–4x pan range so snap-back cannot
      // reveal the canvas.
      const panScale = clampZoomScale(nextScale);
      translateX.value = clampZoomTranslation(
        translateX.value,
        containerWidth,
        panScale,
      );
      translateY.value = clampZoomTranslation(
        translateY.value,
        containerHeight,
        panScale,
      );
    })
    .onEnd(() => {
      if (scale.value < MIN_ZOOM_SCALE) {
        scale.value = withTiming(MIN_ZOOM_SCALE);
        savedScale.value = MIN_ZOOM_SCALE;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      const settledScale = clampZoomScale(scale.value);
      if (settledScale !== scale.value) {
        scale.value = withTiming(settledScale);
      }
      savedScale.value = settledScale;
      const clampedX = clampZoomTranslation(
        translateX.value,
        containerWidth,
        settledScale,
      );
      const clampedY = clampZoomTranslation(
        translateY.value,
        containerHeight,
        settledScale,
      );
      if (clampedX !== translateX.value) translateX.value = withTiming(clampedX);
      if (clampedY !== translateY.value) translateY.value = withTiming(clampedY);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_event, state) => {
      if (scale.value <= MIN_ZOOM_SCALE) state.fail();
      else state.activate();
    })
    .onUpdate((e) => {
      const liveScale = scale.value;
      if (liveScale <= MIN_ZOOM_SCALE) {
        translateX.value = 0;
        translateY.value = 0;
        return;
      }
      translateX.value = clampZoomTranslation(
        savedTranslateX.value + e.translationX,
        containerWidth,
        liveScale,
      );
      translateY.value = clampZoomTranslation(
        savedTranslateY.value + e.translationY,
        containerHeight,
        liveScale,
      );
    })
    .onEnd(() => {
      const liveScale = scale.value;
      const clampedX = clampZoomTranslation(
        translateX.value,
        containerWidth,
        liveScale,
      );
      const clampedY = clampZoomTranslation(
        translateY.value,
        containerHeight,
        liveScale,
      );
      translateX.value = clampedX;
      translateY.value = clampedY;
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > MIN_ZOOM_SCALE) {
        scale.value = withTiming(MIN_ZOOM_SCALE);
        savedScale.value = MIN_ZOOM_SCALE;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      scale.value = withTiming(2);
      savedScale.value = 2;
      const clampedX = clampZoomTranslation(translateX.value, containerWidth, 2);
      const clampedY = clampZoomTranslation(translateY.value, containerHeight, 2);
      if (clampedX !== translateX.value) translateX.value = withTiming(clampedX);
      if (clampedY !== translateY.value) translateY.value = withTiming(clampedY);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
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

  return { composedGesture, animatedStyle, resetTransforms, scale };
}
