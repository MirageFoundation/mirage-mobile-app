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
import { useTopToastStack } from "@/src/stores/toast-layout-store";
import { useNetworkState } from "@/src/hooks/use-network-state";
import { Text } from "./primitives";

const SCREEN_WIDTH = Dimensions.get("window").width;
const TOAST_MIN_WIDTH = Math.round(SCREEN_WIDTH * 0.42);
const TOAST_MAX_WIDTH = Math.round(SCREEN_WIDTH * 0.6);
const TOAST_STACK_ID = "pow-queue-toast";
const EMPTY_STATE_DISMISS_DELAY_MS = 400;
const RESULT_DISPLAY_DURATION_MS = 500;
const VOTE_RESULT_DISPLAY_DURATION_MS = 500;
const ERROR_RESULT_DISPLAY_DURATION_MS = 1000;

type PowPhase = "preparing" | "solving" | "submitting";

const VOTE_ACTION_TYPES = new Set(["upvote", "downvote", "remove_vote"]);

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
  const { isConnected } = useNetworkState();

  const {
    currentAction,
    preparingAction,
    completedCount,
    totalCount,
    lastCompletedAction,
    successOverlay,
    queue,
  } = usePowQueueStore();

  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  const [elapsedMs, setElapsedMs] = useState(0);
  const [hashRate, setHashRate] = useState(0);
  const [phase, setPhase] = useState<PowPhase>("preparing");
  const [isVisible, setIsVisible] = useState(false);
  const [transientResultAction, setTransientResultAction] = useState<{
    type: string;
    success: boolean;
    errorMessage?: string;
    skippedPoW?: boolean;
    elapsedMs: number;
    hashRate: number;
  } | null>(null);
  const [displayedCompletedAction, setDisplayedCompletedAction] = useState<
    typeof lastCompletedAction
  >(null);

  const isAnimatingOutRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const powStartedRef = useRef(false);
  const lastElapsedMsRef = useRef(0);
  const lastHashRateRef = useRef(0);
  const { offset, onLayout } = useTopToastStack(TOAST_STACK_ID, isVisible);

  const visibleCurrentAction = currentAction?.showProgress === false ? null : currentAction;
  const visiblePreparingAction = preparingAction?.showProgress === false ? null : preparingAction;
  const visibleQueue = queue.filter((action) => action.showProgress !== false);
  const hasQueuedOrActiveWork = visibleCurrentAction !== null || visiblePreparingAction !== null || visibleQueue.length > 0;
  const hasPendingWork = hasQueuedOrActiveWork;
  const resultAction = lastCompletedAction ?? displayedCompletedAction;
  const immediateResultAction = successOverlay
    ? {
        ...successOverlay,
        elapsedMs: lastElapsedMsRef.current,
        hashRate: lastHashRateRef.current,
      }
    : null;
  const activeResultAction =
    transientResultAction ?? immediateResultAction ?? resultAction;
  const isVoteResult =
    activeResultAction !== null && VOTE_ACTION_TYPES.has(activeResultAction.type);
  const isErrorResult =
    activeResultAction !== null && !activeResultAction.success;
  const resultDisplayDurationMs = isErrorResult
    ? ERROR_RESULT_DISPLAY_DURATION_MS
    : isVoteResult
      ? VOTE_RESULT_DISPLAY_DURATION_MS
      : RESULT_DISPLAY_DURATION_MS;
  const isShowingResult =
    activeResultAction !== null && !hasQueuedOrActiveWork;
  const hasActiveResultAction = activeResultAction !== null;
  const isShowingProcessing = hasPendingWork && !isShowingResult;
  const isShowingPreparingAction =
    isShowingProcessing && visiblePreparingAction !== null && visibleCurrentAction === null;
  const isOfflineProcessing = isShowingProcessing && !isConnected;

  const displayLabel = isShowingResult
    ? activeResultAction.success
      ? getSuccessLabel(activeResultAction.type as any)
      : activeResultAction.errorMessage || "Failed"
    : visibleCurrentAction?.label ||
      visiblePreparingAction?.label ||
      visibleQueue[0]?.label ||
      (activeResultAction
        ? activeResultAction.success
          ? getSuccessLabel(activeResultAction.type as any)
          : activeResultAction.errorMessage || "Failed"
        : "Processing…");

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
      setTransientResultAction(null);
      setDisplayedCompletedAction(null);
      isAnimatingOutRef.current = false;
    });
  };

  useEffect(() => {
    if (lastCompletedAction) {
      setDisplayedCompletedAction(lastCompletedAction);
    }
  }, [lastCompletedAction]);

  useEffect(() => {
    if (!successOverlay) {
      return;
    }

    setTransientResultAction({
      ...successOverlay,
      elapsedMs: lastElapsedMsRef.current,
      hashRate: lastHashRateRef.current,
    });

    if (transientResultTimeoutRef.current) {
      clearTimeout(transientResultTimeoutRef.current);
    }

    const durationMs = !successOverlay.success
      ? ERROR_RESULT_DISPLAY_DURATION_MS
      : VOTE_ACTION_TYPES.has(successOverlay.type)
        ? VOTE_RESULT_DISPLAY_DURATION_MS
        : RESULT_DISPLAY_DURATION_MS;

    transientResultTimeoutRef.current = setTimeout(() => {
      setTransientResultAction(null);
      transientResultTimeoutRef.current = null;
    }, durationMs);
    // NOTE: deliberately no cleanup that clears the timeout here.
    // The store clears `successOverlay` ~500ms after success, which re-runs
    // this effect. If cleanup cleared the timer, the timer would be killed
    // before it could reset `transientResultAction`, leaving the toast stuck
    // on the previous success state until the NEXT action succeeds (which
    // on free tier with PoW can be many seconds away). The timer is reset
    // on the next non-null `successOverlay` (above), and on unmount via
    // the dedicated unmount-only effect below.
  }, [successOverlay]);

  // Clear the transient-result timeout on unmount only.
  useEffect(() => {
    return () => {
      if (transientResultTimeoutRef.current) {
        clearTimeout(transientResultTimeoutRef.current);
        transientResultTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if ((hasPendingWork || successOverlay) && !isVisible) {
      setIsVisible(true);
      setElapsedMs(0);
      setHashRate(0);
      setPhase("preparing");
      powStartedRef.current = false;
      lastElapsedMsRef.current = 0;
      lastHashRateRef.current = 0;
      animateIn();
    }
  }, [hasPendingWork, isVisible, successOverlay]);

  useEffect(() => {
    if (visibleCurrentAction || visiblePreparingAction) {
      setElapsedMs(0);
      setHashRate(0);
      setPhase("preparing");
      powStartedRef.current = false;
      lastElapsedMsRef.current = 0;
      lastHashRateRef.current = 0;
      setTransientResultAction(null);
      setDisplayedCompletedAction(null);
    }
  }, [visibleCurrentAction, visiblePreparingAction]);

  useEffect(() => {
    if (!hasPendingWork && isVisible) {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }

      dismissTimeoutRef.current = setTimeout(() => {
        const state = usePowQueueStore.getState();
        const hasVisibleWork =
          state.currentAction?.showProgress !== false && state.currentAction !== null ||
          state.preparingAction?.showProgress !== false && state.preparingAction !== null ||
          state.queue.some((action) => action.showProgress !== false);

        if (!hasVisibleWork) {
          animateOut();
        }
      }, hasActiveResultAction ? resultDisplayDurationMs : EMPTY_STATE_DISMISS_DELAY_MS);
    }

    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, [hasActiveResultAction, hasPendingWork, isVisible, resultDisplayDurationMs]);

  useEffect(() => {
    if (isShowingProcessing && isVisible) {
      if (isShowingPreparingAction) return;
      if (!isConnected) return;

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
          if (powStartedRef.current && isConnected) {
            setElapsedMs((prev) => prev + 200);
          }
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [isConnected, isShowingPreparingAction, isShowingProcessing, isVisible]);

  if (!isVisible) return null;

  const isDark = rt.themeName === "dark";

  const getColors = (forOverlay?: { success: boolean }) => {
    const target = forOverlay || (isShowingResult ? activeResultAction : null);
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
  const baseBackgroundColor = isDark
    ? "rgba(45, 48, 55, 0.92)"
    : "rgba(255, 255, 255, 0.92)";

  const hasMultiple = totalCount > 1;

  const statColor = isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)";

  const currentIndex = Math.min(completedCount + 1, totalCount);

  const renderIcon = () => {
    if (isShowingResult) {
      if (activeResultAction?.success) {
        return (
          <Ionicons name="checkmark-circle" size={18} color={colors.icon} />
        );
      } else {
        return <Ionicons name="alert-circle" size={18} color={colors.icon} />;
      }
    }
    return <ActivityIndicator size={12} color={colors.icon} />;
  };

  const resultElapsedMs =
    transientResultAction?.elapsedMs ??
    immediateResultAction?.elapsedMs ??
    lastElapsedMsRef.current;
  const resultHashRate =
    transientResultAction?.hashRate ??
    immediateResultAction?.hashRate ??
    lastHashRateRef.current;

  const showStats =
    (isShowingProcessing && !isOfflineProcessing && phase === "solving" && elapsedMs > 0) ||
    (isShowingResult && resultElapsedMs > 0);

  const renderToastContent = (wrapperProps: any) => {
    const ToastWrapper = Platform.OS === "ios" ? BlurView : View;
    return (
      <ToastWrapper {...wrapperProps}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.iconContainer}>{renderIcon()}</View>
            <View style={styles.textContainer}>
              <Text
                size="xs"
                weight="semibold"
                numberOfLines={2}
                style={styles.labelText}
              >
                {displayLabel}
              </Text>
            </View>
            <View style={styles.rightSection}>
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
          </View>

          {(isShowingProcessing || isShowingResult) && (
            <Text style={[styles.phaseText, { color: statColor }]}> 
              {isShowingResult
                ? activeResultAction?.success
                  ? isVoteResult || activeResultAction.skippedPoW
                    ? "Submitted"
                    : "PoW Solved"
                  : activeResultAction?.skippedPoW
                    ? "Failed"
                    : "PoW Failed"
                : isOfflineProcessing
                  ? "Waiting for internet…"
                  : PHASE_LABEL[phase]}
            </Text>
          )}

          {showStats && (
            <View style={styles.statsRow}>
              <Text style={[styles.statText, { color: statColor }]}>
                {formatElapsedTime(
                  isShowingResult ? resultElapsedMs : elapsedMs,
                )}
              </Text>
              {(isShowingResult ? resultHashRate : hashRate) > 0 && (
                <Text style={[styles.statText, { color: statColor }]}>
                  {formatHashRate(
                    isShowingResult ? resultHashRate : hashRate,
                  )}
                </Text>
              )}
            </View>
          )}
        </View>
      </ToastWrapper>
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
              backgroundColor: baseBackgroundColor,
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
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + 4 + offset }]}
    >
      <Animated.View
        style={{
          transform: [{ translateY }, { scale }],
          opacity,
        }}
      >
        <View onLayout={onLayout} style={styles.innerWrap}>
          {Platform.OS === "ios" ? (
            <View style={[styles.borderWrap, { borderColor: colors.border }]}>
              {renderToastContent(wrapperProps)}
            </View>
          ) : (
            renderToastContent(wrapperProps)
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  innerWrap: {
    minWidth: TOAST_MIN_WIDTH,
    maxWidth: TOAST_MAX_WIDTH,
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
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  textContainer: {
    flexShrink: 1,
    flexGrow: 1,
  },
  labelText: {
    flexShrink: 1,
    flexGrow: 0,
    fontSize: 12,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 28,
  },
  phaseText: {
    fontSize: 12,
    marginLeft: 28,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 1,
    marginLeft: 28,
  },
  statText: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
}));
