import { useEffect, useState } from "react";
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
import type { PressedMediaTransition } from "@/src/utils/post-transition";

import {
  INPUT_DOCK_HEIGHT,
  getMediaPostDetailLayoutMetrics,
  type MediaPostDetailInsets,
} from "./media-post-detail-layout";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

type UseMediaPostDetailLayoutOptions = {
  insets: MediaPostDetailInsets;
  shouldOpenInitially?: boolean;
  sourceMediaTransition?: PressedMediaTransition | null;
};

export function useMediaPostDetailLayout({
  insets,
  shouldOpenInitially = false,
  sourceMediaTransition,
}: UseMediaPostDetailLayoutOptions) {
  const [measuredInputDockH, setMeasuredInputDockH] = useState(
    INPUT_DOCK_HEIGHT + insets.bottom,
  );
  const [measuredPostSummaryH, setMeasuredPostSummaryH] = useState(0);
  const metrics = getMediaPostDetailLayoutMetrics({
    insets,
    measuredInputDockH,
    measuredPostSummaryH,
    screenH: SCREEN_H,
  });
  const {
    collapseDistance,
    collapsedMediaH,
    collapsedMediaTop,
    expandedMediaH,
    expandedMediaTop,
    headerH,
    inputDockTotalH,
    listTopY,
  } = metrics;

  const scrollOffset = useSharedValue(shouldOpenInitially ? collapseDistance : 0);
  const mediaEnterProgress = useSharedValue(sourceMediaTransition ? 0 : 1);
  const collapseProgress = useDerivedValue(() => {
    if (collapseDistance <= 0) return shouldOpenInitially ? 1 : 0;
    return interpolate(
      scrollOffset.value,
      [0, collapseDistance],
      [0, 1],
      Extrapolation.CLAMP,
    );
  });

  useEffect(() => {
    if (!sourceMediaTransition) return;
    mediaEnterProgress.value = 0;
    mediaEnterProgress.value = withTiming(1, { duration: 260 });
  }, [mediaEnterProgress, sourceMediaTransition]);

  const mediaContainerStyle = useAnimatedStyle(() => {
    const progress = collapseProgress.value;
    const targetTop =
      expandedMediaTop + (collapsedMediaTop - expandedMediaTop) * progress;
    const targetHeight =
      expandedMediaH + (collapsedMediaH - expandedMediaH) * progress;

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
      height:
        sourceMediaTransition.height +
        (targetHeight - sourceMediaTransition.height) * enter,
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
      [0, 1],
      [1, 0.55],
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

  const [footerInteractive, setFooterInteractive] = useState(!shouldOpenInitially);
  const [isCollapsed, setIsCollapsed] = useState(shouldOpenInitially);
  useAnimatedReaction(
    () => collapseProgress.value,
    (value, prev) => {
      const nextInteractive = value < 0.1;
      const wasInteractive = prev === null ? !shouldOpenInitially : prev < 0.1;
      if (nextInteractive !== wasInteractive) {
        runOnJS(setFooterInteractive)(nextInteractive);
      }
      const nextCollapsed = value > 0.85;
      const wasCollapsed = prev === null ? shouldOpenInitially : prev > 0.85;
      if (nextCollapsed !== wasCollapsed) {
        runOnJS(setIsCollapsed)(nextCollapsed);
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
    collapseDistance,
    collapseProgress,
    compactOverlayStyle,
    footerInteractive,
    footerStyle,
    headerH,
    headerStyle,
    inputDockStyle,
    inputDockTotalH,
    isCollapsed,
    listTopY,
    mediaContainerStyle,
    measuredInputDockH,
    measuredPostSummaryH,
    scrollOffset,
    setMeasuredInputDockH,
    setMeasuredPostSummaryH,
  };
}
