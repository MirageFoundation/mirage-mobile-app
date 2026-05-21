import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import BottomSheet, { useBottomSheetSpringConfigs } from "@gorhom/bottom-sheet";
import type { PressedMediaTransition } from "@/src/utils/post-transition";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
const COLLAPSED_FRACTION = 0.3;
const HEADER_HEIGHT_BASE = 48;
const INPUT_DOCK_HEIGHT = 52;

type Insets = {
  top: number;
  bottom: number;
};

type UseMediaPostDetailLayoutOptions = {
  insets: Insets;
  onDismiss: () => void;
  sourceMediaTransition?: PressedMediaTransition | null;
};

export function useMediaPostDetailLayout({
  insets,
  onDismiss,
  sourceMediaTransition,
}: UseMediaPostDetailLayoutOptions) {
  const headerH = insets.top + HEADER_HEIGHT_BASE;
  const [measuredInputDockH, setMeasuredInputDockH] = useState(
    INPUT_DOCK_HEIGHT + insets.bottom,
  );
  const inputDockTotalH = measuredInputDockH;
  const [measuredFooterH, setMeasuredFooterH] = useState(0);

  const expandedMediaTop = headerH;
  const collapsedMediaTop = insets.top;
  const collapsedMediaH = Math.round(SCREEN_H * COLLAPSED_FRACTION);
  const expandedMediaH = Math.max(
    collapsedMediaH,
    SCREEN_H - headerH - Math.max(measuredFooterH, insets.bottom),
  );
  const listTopY = collapsedMediaTop + collapsedMediaH;

  const expandedSheetH = Math.max(100, SCREEN_H - listTopY);
  const snapPoints = useMemo(() => [expandedSheetH], [expandedSheetH]);
  const sheetAnimationConfigs = useBottomSheetSpringConfigs({
    damping: 42,
    stiffness: 620,
    mass: 0.75,
    overshootClamping: true,
  });
  const sheetRef = useRef<BottomSheet>(null);

  const animatedIndex = useSharedValue(-1);
  const mediaEnterProgress = useSharedValue(sourceMediaTransition ? 0 : 1);
  const collapseProgress = useDerivedValue(() => {
    const value = animatedIndex.value + 1;
    return value < 0 ? 0 : value > 1 ? 1 : value;
  });

  useEffect(() => {
    if (!sourceMediaTransition) return;
    mediaEnterProgress.value = 0;
    mediaEnterProgress.value = withTiming(1, { duration: 260 });
  }, [mediaEnterProgress, sourceMediaTransition]);

  const dragDownY = useSharedValue(0);
  const openSheet = useCallback(() => {
    sheetRef.current?.snapToIndex(0);
  }, []);
  const closeSheet = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  const mediaPan = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        dragDownY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -40 || event.velocityY < -600) {
        runOnJS(openSheet)();
        dragDownY.value = 0;
        return;
      }
      if (event.translationY > 120 || event.velocityY > 800) {
        runOnJS(onDismiss)();
        return;
      }
      dragDownY.value = 0;
    });

  const mediaContainerStyle = useAnimatedStyle(() => {
    const progress = collapseProgress.value;
    const targetHeight = expandedMediaH + (collapsedMediaH - expandedMediaH) * progress;
    const targetTop = expandedMediaTop + (collapsedMediaTop - expandedMediaTop) * progress;

    if (!sourceMediaTransition) {
      return {
        height: targetHeight,
        top: targetTop,
        transform: [{ translateY: dragDownY.value }],
      };
    }

    const enter = mediaEnterProgress.value;
    const sourceCenterX = sourceMediaTransition.x + sourceMediaTransition.width / 2;
    const targetCenterX = SCREEN_W / 2;
    const sourceScaleX = sourceMediaTransition.width / SCREEN_W;

    return {
      height: sourceMediaTransition.height + (targetHeight - sourceMediaTransition.height) * enter,
      top: sourceMediaTransition.y + (targetTop - sourceMediaTransition.y) * enter,
      transform: [
        { translateX: (sourceCenterX - targetCenterX) * (1 - enter) },
        { scaleX: sourceScaleX + (1 - sourceScaleX) * enter },
        { translateY: dragDownY.value },
      ],
    };
  });

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0, 0.4],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0, 0.3],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const [footerInteractive, setFooterInteractive] = useState(true);
  useAnimatedReaction(
    () => collapseProgress.value,
    (value, prev) => {
      const next = value < 0.1;
      if (next !== (prev === null || prev < 0.1)) {
        runOnJS(setFooterInteractive)(next);
      }
    },
  );

  const compactOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0.6, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const inputDockStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0.5, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return {
    animatedIndex,
    collapseMedia: openSheet,
    collapseProgress,
    compactOverlayStyle,
    expandMedia: closeSheet,
    footerInteractive,
    footerStyle,
    headerH,
    headerStyle,
    inputDockStyle,
    inputDockTotalH,
    listTopY,
    mediaContainerStyle,
    mediaPan,
    measuredFooterH,
    measuredInputDockH,
    setMeasuredFooterH,
    setMeasuredInputDockH,
    sheetAnimationConfigs,
    sheetRef,
    snapPoints,
  };
}
