import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { usePowQueueStore, getSuccessLabel } from "@/src/services/pow-queue";
import { getPowProgress } from "@/src/wallet";
import { Text } from "./primitives";

const SCREEN_WIDTH = Dimensions.get("window").width;
const TOAST_WIDTH = Math.round(SCREEN_WIDTH * 0.42);

type PowPhase = "preparing" | "solving" | "submitting";

const PHASE_LABEL: Record<PowPhase, string> = {
  preparing: "Preparing…",
  solving: "Solving PoW…",
  submitting: "Submitting…",
};

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
    return `${(rate / 1000).toFixed(1)}k h/s`;
  }
  return `${Math.round(rate)} h/s`;
};

export const PowQueueToast = () => {
  const { theme, rt } = useUnistyles();
  const insets = useSafeAreaInsets();

  const {
    isProcessing,
    currentAction,
    completedCount,
    totalCount,
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
  const [phase, setPhase] = useState<PowPhase>("preparing");
  const [isVisible, setIsVisible] = useState(false);
  const [overlayData, setOverlayData] = useState<{
    type: string;
    success: boolean;
   elapsedMs: number;
   hashRate: number;
  } | null>(null);

  const isAnimatingOutRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powStartedRef = useRef(false);
  const lastElapsedMsRef = useRef(0);
  const lastHashRateRef = useRef(0);

  const isShowingResult =
    currentAction === null && lastCompletedAction !== null;
  const isShowingProcessing = currentAction !== null;

  const displayLabel = isShowingResult
    ? lastCompletedAction.success
      ? getSuccessLabel(lastCompletedAction.type)
      : "Failed"
    : currentAction?.label || queue[0]?.label || "Processing…";

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
      setPhase("preparing");
      powStartedRef.current = false;
      animateIn();
    }
  }, [isProcessing, isVisible]);

  useEffect(() => {
    if (currentAction) {
      setElapsedMs(0);
      setHashRate(0);
      setPhase("preparing");
      powStartedRef.current = false;
    }
  }, [currentAction?.id]);

  useEffect(() => {
    if (successOverlay) {
     setOverlayData({
       ...successOverlay,
       elapsedMs: lastElapsedMsRef.current,
       hashRate: lastHashRateRef.current,
     });
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
          const { elapsedMs: elapsed, attempts: att } = progress;

          if (att > 0 && !powStartedRef.current) {
            powStartedRef.current = true;
            setPhase("solving");
          }

          if (powStartedRef.current) {
            setElapsedMs(elapsed);
            lastElapsedMsRef.current = elapsed;

            if (elapsed > 0 && att > 0) {
              const rate = att / (elapsed / 1000);
              setHashRate(rate);
              lastHashRateRef.current = rate;
            }
          }
        } catch {
          if (powStartedRef.current) {
            setElapsedMs((prev) => prev + 200);
          }
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

  const statColor = isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)";

  const currentIndex = Math.min(completedCount + 1, totalCount);

  const renderIcon = () => {
    if (isShowingResult) {
      if (lastCompletedAction.success) {
        return (
          <Ionicons name="checkmark-circle" size={18} color={colors.icon} />
        );
      } else {
        return <Ionicons name="alert-circle" size={18} color={colors.icon} />;
      }
    }
    return <ActivityIndicator size={12} color={colors.icon} />;
  };

  const showStats =
    (isShowingProcessing && phase === "solving" && elapsedMs > 0) ||
    (isShowingResult && lastElapsedMsRef.current > 0);

  const renderToastContent = (wrapperProps: any) => {
    const ToastWrapper = Platform.OS === "ios" ? BlurView : View;
    return (
      <ToastWrapper {...wrapperProps}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.iconContainer}>{renderIcon()}</View>
            <Text
              size="xs"
              weight="semibold"
              numberOfLines={1}
              style={styles.labelText}
            >
              {displayLabel}
            </Text>
            {hasMultiple && isShowingProcessing && (
              <Text
                size="xs"
                weight="bold"
                style={{
                  color: statColor,
                  fontSize: 9,
                  fontVariant: ["tabular-nums"] as any,
                }}
              >
                {currentIndex}/{totalCount}
              </Text>
            )}
          </View>

          {(isShowingProcessing || isShowingResult) && !overlayData && (
            <Text style={[styles.phaseText, { color: statColor }]}>
              {isShowingResult
                ? lastCompletedAction.success
                  ? "PoW Solved"
                  : "PoW Failed"
                : PHASE_LABEL[phase]}
            </Text>
          )}

          {showStats && !overlayData && (
            <View style={styles.statsRow}>
              <Text style={[styles.statText, { color: statColor }]}>
                {formatElapsedTime(
                  isShowingResult ? lastElapsedMsRef.current : elapsedMs,
                )}
              </Text>
              {(isShowingResult ? lastHashRateRef.current : hashRate) > 0 && (
                <Text style={[styles.statText, { color: statColor }]}>
                  {formatHashRate(
                    isShowingResult ? lastHashRateRef.current : hashRate,
                  )}
                </Text>
              )}
            </View>
          )}
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

    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.overlayContainer,
          {
            opacity: overlayOpacity,
            backgroundColor: isDark
              ? "rgba(45, 48, 55, 1)"
              : "rgba(255, 255, 255, 1)",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: overlayColors.border,
            overflow: "hidden",
          },
        ]}
      >
        <View style={styles.overlayContent}>
          <View style={styles.headerRow}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={overlayData.success ? "checkmark-circle" : "alert-circle"}
                size={14}
                color={overlayColors.icon}
              />
            </View>
            <Text
              size="xs"
              weight="semibold"
              numberOfLines={1}
              style={styles.labelText}
            >
              {overlayLabel}
            </Text>
          </View>
          <Text style={[styles.phaseText, { color: statColor }]}>
            {overlayData.success ? "PoW Solved" : "PoW Failed"}
          </Text>
          {overlayData.elapsedMs > 0 && (
            <View style={styles.statsRow}>
              <Text style={[styles.statText, { color: statColor }]}>
                {formatElapsedTime(overlayData.elapsedMs)}
              </Text>
              {overlayData.hashRate > 0 && (
                <Text style={[styles.statText, { color: statColor }]}>
                  {formatHashRate(overlayData.hashRate)}
                </Text>
              )}
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  const wrapperProps =
    Platform.OS === "ios"
      ? {
          intensity: 80,
          tint: isDark ? ("dark" as const) : ("light" as const),
          style: [styles.blurInner],
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
      {Platform.OS === "ios" ? (
        <View style={[styles.borderWrap, { borderColor: colors.border }]}>
          {renderToastContent(wrapperProps)}
        </View>
      ) : (
        renderToastContent(wrapperProps)
      )}
      {renderOverlay()}
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    width: TOAST_WIDTH,
    alignSelf: "center",
    left: (SCREEN_WIDTH - TOAST_WIDTH) / 2,
    zIndex: 9999,
  },
  blurContainer: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
  },
  blurInner: {
    overflow: "hidden",
    borderRadius: 11,
  },
  borderWrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconContainer: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 5,
  },
  labelText: {
    flex: 1,
    fontSize: 11,
  },
  phaseText: {
    fontSize: 12,
    marginLeft: 25,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 1,
  },
  statText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  overlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  overlayContent: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
}));
