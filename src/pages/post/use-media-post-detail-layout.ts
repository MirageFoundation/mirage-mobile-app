import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions } from "react-native";
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
const SHEET_HANDLE_HEIGHT = 28;
const INITIAL_SHEET_EXTRA_PADDING = 6;
const INITIAL_SHEET_MIN_HEIGHT = 132;
const INITIAL_SHEET_MAX_FRACTION = 0.55;

type Insets = {
  top: number;
  bottom: number;
};

type UseMediaPostDetailLayoutOptions = {
  insets: Insets;
  sourceMediaTransition?: PressedMediaTransition | null;
};

export function useMediaPostDetailLayout({
  insets,
  sourceMediaTransition,
}: UseMediaPostDetailLayoutOptions) {
  const headerH = insets.top + HEADER_HEIGHT_BASE;
  const [measuredInputDockH, setMeasuredInputDockH] = useState(
    INPUT_DOCK_HEIGHT + insets.bottom,
  );
  const inputDockTotalH = measuredInputDockH;
  const [measuredPostSummaryH, setMeasuredPostSummaryH] = useState(0);

  const expandedMediaTop = headerH;
  const collapsedMediaTop = insets.top;
  const collapsedMediaH = Math.round(SCREEN_H * COLLAPSED_FRACTION);
  const listTopY = collapsedMediaTop + collapsedMediaH;
  const expandedSheetH = Math.max(100, SCREEN_H - listTopY);
  const measuredInitialSheetH = measuredPostSummaryH + SHEET_HANDLE_HEIGHT + INITIAL_SHEET_EXTRA_PADDING;
  const initialSheetH = Math.min(
    Math.max(measuredInitialSheetH || 0, INITIAL_SHEET_MIN_HEIGHT),
    Math.min(expandedSheetH - 24, SCREEN_H * INITIAL_SHEET_MAX_FRACTION),
  );
  const initialSheetTop = SCREEN_H - initialSheetH;

  const snapPoints = useMemo(
    () => [initialSheetH, expandedSheetH],
    [initialSheetH, expandedSheetH],
  );
  const sheetAnimationConfigs = useBottomSheetSpringConfigs({
    damping: 34,
    stiffness: 360,
    mass: 0.9,
    overshootClamping: false,
  });
  const sheetRef = useRef<BottomSheet>(null);

  const animatedIndex = useSharedValue(0);
  const animatedPosition = useSharedValue(initialSheetTop);
  const mediaEnterProgress = useSharedValue(sourceMediaTransition ? 0 : 1);
  const collapseProgress = useDerivedValue(() => {
    return interpolate(
      animatedPosition.value,
      [listTopY, initialSheetTop],
      [1, 0],
      Extrapolation.CLAMP,
    );
  });

  useEffect(() => {
    if (!sourceMediaTransition) return;
    mediaEnterProgress.value = 0;
    mediaEnterProgress.value = withTiming(1, { duration: 260 });
  }, [mediaEnterProgress, sourceMediaTransition]);

  const openSheet = useCallback(() => {
    sheetRef.current?.snapToIndex(1);
  }, []);
  const closeSheet = useCallback(() => {
    sheetRef.current?.snapToIndex(0);
  }, []);

  const mediaContainerStyle = useAnimatedStyle(() => {
    const progress = collapseProgress.value;
    const targetTop = expandedMediaTop + (collapsedMediaTop - expandedMediaTop) * progress;
    const targetHeight = Math.max(1, animatedPosition.value - targetTop);

    if (!sourceMediaTransition) {
      return {
        height: targetHeight,
        top: targetTop,
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
    animatedPosition,
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
    measuredInputDockH,
    measuredPostSummaryH,
    setMeasuredInputDockH,
    setMeasuredPostSummaryH,
    sheetAnimationConfigs,
    sheetRef,
    snapPoints,
  };
}
