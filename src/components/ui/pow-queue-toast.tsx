/**
 * POW Queue Toast
 *
 * A persistent toast that shows when POW actions are being processed.
 * Displays queue progress (1/3), current action, and POW progress.
 * Shows brief success/error state after each action before continuing.
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
  } = usePowQueueStore();

  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  
  const isAnimatingOutRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasProcessingRef = useRef(false);

  // Determine visual state based on store state
  // - currentAction exists → processing
  // - currentAction is null but lastCompletedAction exists → showing result
  // - neither → idle
  const isShowingResult = currentAction === null && lastCompletedAction !== null;
  const isShowingProcessing = currentAction !== null;

  // Get display label
  const displayLabel = isShowingResult
    ? (lastCompletedAction.success 
        ? getSuccessLabel(lastCompletedAction.type)
        : "Failed")
    : (currentAction?.label || "Processing...");

  // Animate in
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

  // Animate out
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

  // Show toast when processing starts
  useEffect(() => {
    if (isProcessing && !isVisible) {
      setIsVisible(true);
      setElapsedMs(0);
      animateIn();
    }
    wasProcessingRef.current = isProcessing;
  }, [isProcessing, isVisible]);

  // Reset timer when a new action starts
  useEffect(() => {
    if (currentAction) {
      setElapsedMs(0);
    }
  }, [currentAction?.id]);

 // Dismiss when processing ends (after showing final result)
 useEffect(() => {
    // Dismiss when processing ends and we're showing the final result
    // Don't wait for lastCompletedAction to clear - dismiss while still showing success/fail
    if (!isProcessing && !currentAction && lastCompletedAction && isVisible) {
      // Show the result briefly, then dismiss
     if (dismissTimeoutRef.current) {
       clearTimeout(dismissTimeoutRef.current);
     }
     dismissTimeoutRef.current = setTimeout(() => {
       animateOut();
      }, 1000); // Show result for 1 second before dismissing
   }
   
   return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, [isProcessing, currentAction, lastCompletedAction, isVisible]);

  // Timer for elapsed time (only when processing)
  useEffect(() => {
    if (isShowingProcessing && isVisible) {
      const interval = setInterval(() => {
        setElapsedMs((prev) => prev + 100);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isShowingProcessing, isVisible]);

  if (!isVisible) return null;

  const isDark = rt.themeName === "dark";
  
  const getColors = () => {
    if (isShowingResult) {
      if (lastCompletedAction.success) {
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

  const ToastWrapper = Platform.OS === "ios" ? BlurView : View;
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
            size={20}
            color={colors.icon}
          />
        );
      } else {
        return (
          <Ionicons
            name="alert-circle"
            size={20}
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

 return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: insets.top + 8,
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
    >
      <ToastWrapper {...wrapperProps}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            {renderIcon()}
          </View>

          <View style={styles.textContainer}>
            <Text size="sm" weight="semibold" numberOfLines={1}>
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

            {showTimer && (
              <View style={[styles.timerContainer, { backgroundColor: timerBackground }]}>
                <Text size="sm" weight="medium" style={styles.timerText}>
                  {formatElapsedTime(elapsedMs)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ToastWrapper>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: 38,
    right: 38,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  iconContainer: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  counterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  counterText: {
    color: theme.colors.text.default,
    fontVariant: ["tabular-nums"],
    fontSize: 11,
  },
  timerContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 48,
    alignItems: "center",
  },
  timerText: {
    color: theme.colors.text.subtle,
    fontVariant: ["tabular-nums"],
  },
}));
