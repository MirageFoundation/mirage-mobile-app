/**
 * POW Queue Toast
 *
 * A persistent toast that shows when POW actions are being processed.
 * Displays queue progress (1/3), current action, and POW progress.
 * Shows brief success/error overlay after each action while the next one
 * starts processing concurrently in the background.
 */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { usePowQueueStore, getSuccessLabel } from "@/src/services/pow-queue";
import { getPowProgress } from "@/src/wallet";
import { Text } from "./primitives";

const formatElapsedTime = (ms: number): string => {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatHashRate = (rate: number): string => {
  if (rate >= 1000) {
    return `${(rate / 1000).toFixed(1)}k`;
  }
  return `${Math.round(rate)}`;
};

export const PowQueueToast = () => {
  const { theme, rt } = useUnistyles();
  const insets = useSafeAreaInsets();

 const {
   isProcessing,
   currentAction,
   completedCount,
   totalCount,
   currentProgress,
   lastCompletedAction,
   successOverlay,
   queue,
 } = usePowQueueStore();

  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  
  const [elapsedMs, setElapsedMs] = useState(0);
  const [hashRate, setHashRate] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [overlayData, setOverlayData] = useState<{ type: string; success: boolean } | null>(null);
  
  const isAnimatingOutRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isShowingResult = currentAction === null && lastCompletedAction !== null;
  const isShowingProcessing = currentAction !== null;

  const displayLabel = isShowingResult
    ? (lastCompletedAction.success 
        ? getSuccessLabel(lastCompletedAction.type)
        : "Failed")
    : (currentAction?.label || queue[0]?.label || "Processing...");

  const animateIn = () => {
    isAnimatingOutRef.current = false;
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }),
    ]).start();
  };

  const animateOut = () => {
    if (isAnimatingOutRef.current) return;
    isAnimatingOutRef.current = true;
    
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
      isAnimatingOutRef.current = false;
    });
  };

  useEffect(() => {
    if (isProcessing && !isVisible) {
      setIsVisible(true);
      setElapsedMs(0);
      setHashRate(0);
      animateIn();
    }
  }, [isProcessing, isVisible]);

  useEffect(() => {
    if (currentAction) {
      setElapsedMs(0);
      setHashRate(0);
    }
  }, [currentAction?.id]);

 useEffect(() => {
   if (successOverlay) {
     setOverlayData(successOverlay);
     overlayOpacity.setValue(0);
     Animated.sequence([
       Animated.timing(overlayOpacity, {
         toValue: 1,
         duration: 120,
         useNativeDriver: true,
       }),
       Animated.delay(1200),
       Animated.timing(overlayOpacity, {
         toValue: 0,
         duration: 350,
         useNativeDriver: true,
       }),
     ]).start(() => {
       setOverlayData(null);
     });
   }
 }, [successOverlay]);

  useEffect(() => {
    if (!isProcessing && !currentAction && isVisible) {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
      if (lastCompletedAction) {
        dismissTimeoutRef.current = setTimeout(() => {
          animateOut();
        }, 1000);
      } else {
        animateOut();
      }
    }

    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, [isProcessing, currentAction, lastCompletedAction, isVisible]);

  useEffect(() => {
    if (isShowingProcessing && isVisible) {
      const interval = setInterval(async () => {
        try {
          const progress = await getPowProgress();
          setElapsedMs(progress.elapsedMs);
          if (progress.elapsedMs > 0 && progress.attempts > 0) {
            const rate = progress.attempts / (progress.elapsedMs / 1000);
            setHashRate(rate);
          }
        } catch {
          setElapsedMs((prev) => prev + 200);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [isShowingProcessing, isVisible]);

  if (!isVisible) return null;

  const isDark = rt.themeName === "dark";
  
  const getColors = (forOverlay?: { success: boolean }) => {
    const target = forOverlay || (isShowingResult ? lastCompletedAction : null);
    if (target) {
      if (target.success) {
        return {
          icon: theme.colors.success[500],
          border: theme.colors.success[500] + "40",
        };
      } else {
        return {
          icon: theme.colors.error[500],
          border: theme.colors.error[500] + "40",
        };
      }
    }
    return {
      icon: theme.colors.primary[500],
      border: theme.colors.primary[500] + "40",
    };
  };

  const colors = getColors();

  const hasMultiple = totalCount > 1;
  const progressPercent = currentProgress > 0 ? `${Math.round(currentProgress)}%` : "";

  const badgeBackground = isDark
    ? "rgba(255, 255, 255, 0.15)"
    : "rgba(0, 0, 0, 0.08)";

  const timerBackground = isDark
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.06)";

  const renderIcon = () => {
    if (isShowingResult) {
      if (lastCompletedAction.success) {
        return (
          <Ionicons
            name="checkmark-circle"
            size={16}
            color={colors.icon}
          />
        );
      } else {
        return (
          <Ionicons
            name="alert-circle"
            size={16}
            color={colors.icon}
          />
        );
      }
    }
    return <ActivityIndicator size="small" color={colors.icon} />;
  };

 const showCounter = hasMultiple && isShowingProcessing;
 const showTimer = isShowingProcessing;
  const currentIndex = Math.min(completedCount + 1, totalCount);

  const renderToastContent = (wrapperProps: any) => {
    const ToastWrapper = Platform.OS === "ios" ? BlurView : View;
    return (
      <ToastWrapper {...wrapperProps}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            {renderIcon()}
          </View>

          <View style={styles.textContainer}>
            <Text size="xs" weight="semibold" numberOfLines={1}>
              {displayLabel}
              {isShowingProcessing && progressPercent ? ` ${progressPercent}` : ""}
            </Text>
          </View>

          <View style={styles.rightSection}>
            {showCounter && (
              <View style={[styles.counterBadge, { backgroundColor: badgeBackground }]}>
                <Text size="xs" weight="bold" style={styles.counterText}>
                  {currentIndex}/{totalCount}
                </Text>
              </View>
            )}

            {showTimer && hashRate > 0 && (
              <View style={[styles.hashRateContainer, { backgroundColor: timerBackground }]}>
                <Text size="xs" weight="medium" style={styles.timerText}>
                  {formatHashRate(hashRate)} h/s
                </Text>
              </View>
            )}

            {showTimer && (
              <View style={[styles.timerContainer, { backgroundColor: timerBackground }]}>
                <Text size="xs" weight="medium" style={styles.timerText}>
                  {formatElapsedTime(elapsedMs)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ToastWrapper>
    );
  };

  const renderOverlay = () => {
    if (!overlayData) return null;

    const overlayColors = getColors(overlayData);
    const overlayLabel = overlayData.success
      ? getSuccessLabel(overlayData.type as any)
      : "Failed";

    const overlayWrapperProps =
      Platform.OS === "ios"
        ? {
            intensity: 80,
            tint: isDark ? ("dark" as const) : ("light" as const),
            style: [styles.blurContainer, { borderColor: overlayColors.border }],
          }
        : {
            style: [
              styles.blurContainer,
              {
                backgroundColor: isDark
                  ? "rgba(45, 48, 55, 0.97)"
                  : "rgba(255, 255, 255, 0.97)",
                borderColor: overlayColors.border,
                elevation: 10,
              },
            ],
          };

    const ToastWrapper = Platform.OS === "ios" ? BlurView : View;

    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.overlayContainer,
          { opacity: overlayOpacity },
        ]}
      >
        <ToastWrapper {...overlayWrapperProps}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={overlayData.success ? "checkmark-circle" : "alert-circle"}
                size={16}
                color={overlayColors.icon}
              />
            </View>
            <View style={styles.textContainer}>
              <Text size="xs" weight="semibold" numberOfLines={1}>
                {overlayLabel}
              </Text>
            </View>
          </View>
        </ToastWrapper>
      </Animated.View>
    );
  };

  const wrapperProps =
    Platform.OS === "ios"
      ? {
          intensity: 80,
          tint: isDark ? ("dark" as const) : ("light" as const),
          style: [styles.blurContainer, { borderColor: colors.border }],
        }
      : {
          style: [
            styles.blurContainer,
            {
              backgroundColor: isDark
                ? "rgba(45, 48, 55, 0.92)"
                : "rgba(255, 255, 255, 0.92)",
              borderColor: colors.border,
              elevation: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
            },
          ],
        };

 return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: insets.top + 4,
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
    >
      {renderToastContent(wrapperProps)}
      {renderOverlay()}
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: 48,
    right: 48,
    zIndex: 9999,
  },
  blurContainer: {
    overflow: "hidden",
    borderRadius: 9999,
    borderWidth: 1,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  iconContainer: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  counterBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  counterText: {
    color: theme.colors.text.default,
    fontVariant: ["tabular-nums"],
    fontSize: 10,
  },
  hashRateContainer: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timerContainer: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 36,
    alignItems: "center",
  },
  timerText: {
    color: theme.colors.text.subtle,
    fontVariant: ["tabular-nums"],
    fontSize: 10,
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
}));
