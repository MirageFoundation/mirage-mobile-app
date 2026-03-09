/**
 * Toast Component
 *
 * A minimal notification toast that appears at the top of the screen.
 * Shows only one toast at a time with a counter for multiple toasts.
 */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "./primitives";

/**
 * Format elapsed time in a compact way
 */
const formatElapsedTime = (ms: number): string => {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export type ToastType = "loading" | "success" | "error" | "info";

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: () => void;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
  currentIndex: number;
  totalCount: number;
  onNext?: () => void;
}

const ICON_MAP: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  loading: "sync",
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

export const Toast = ({
  toast,
  onDismiss,
  currentIndex,
  totalCount,
  onNext,
}: ToastProps) => {
  const { theme, rt } = useUnistyles();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-50)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const [elapsedMs, setElapsedMs] = useState(0);

  // Entrance animation
  useEffect(() => {
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
  }, []);

  // Elapsed time counter for loading toasts
  useEffect(() => {
    if (toast.type === "loading") {
      setElapsedMs(0);
      const interval = setInterval(() => {
        setElapsedMs((prev) => prev + 100);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [toast.type, toast.id]);

  // Auto dismiss
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, toast.id]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -50,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss(toast.id);
    });
  };

  const getIconColor = () => {
    switch (toast.type) {
      case "success":
        return theme.colors.success[500];
      case "error":
        return theme.colors.error[500];
      case "loading":
        return theme.colors.primary[500];
      case "info":
      default:
        return theme.colors.primary[500];
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case "success":
        return theme.colors.success[500] + "40";
      case "error":
        return theme.colors.error[500] + "40";
      case "loading":
        return theme.colors.primary[500] + "40";
      case "info":
      default:
        return theme.colors.primary[500] + "40";
    }
  };

  const isDark = rt.themeName === "dark";

  // Platform-specific wrapper - same as original
  const ToastWrapper = Platform.OS === "ios" ? BlurView : View;
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
              borderColor: getBorderColor(),
              elevation: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
            },
          ],
        };

  const hasMultiple = totalCount > 1;

  const badgeBackground = isDark
    ? "rgba(255, 255, 255, 0.15)"
    : "rgba(0, 0, 0, 0.08)";

  const timerBackground = isDark
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.06)";

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
      <Pressable
        onPress={toast.action ? toast.action : toast.type !== "loading" ? handleDismiss : undefined}
        onLongPress={hasMultiple ? onNext : undefined}
      >
        {Platform.OS === "ios" ? (
          <View style={[styles.borderWrap, { borderColor: getBorderColor() }]}>
            <ToastWrapper {...wrapperProps}>
              <View style={styles.content}>
                <View style={styles.iconContainer}>
                  {toast.type === "loading" ? (
                    <ActivityIndicator size="small" color={getIconColor()} />
                  ) : (
                    <Ionicons
                      name={ICON_MAP[toast.type]}
                      size={16}
                      color={getIconColor()}
                    />
                  )}
                </View>
                <View style={styles.textContainer}>
                  <Text size="xs" weight="semibold" numberOfLines={1}>
                    {toast.title}
                  </Text>
                </View>
                <View style={styles.rightSection}>
                  {hasMultiple && (
                    <Pressable onPress={onNext} style={[styles.counterBadge, { backgroundColor: badgeBackground }]}>
                      <Text size="xs" weight="bold" style={styles.counterText}>
                        {currentIndex + 1}/{totalCount}
                      </Text>
                    </Pressable>
                  )}
                  {toast.type === "loading" && (
                    <View style={[styles.timerContainer, { backgroundColor: timerBackground }]}>
                      <Text size="xs" weight="medium" style={styles.timerText}>
                        {formatElapsedTime(elapsedMs)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </ToastWrapper>
          </View>
        ) : (
        <ToastWrapper {...wrapperProps}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              {toast.type === "loading" ? (
                <ActivityIndicator size="small" color={getIconColor()} />
              ) : (
                <Ionicons
                  name={ICON_MAP[toast.type]}
                  size={16}
                  color={getIconColor()}
                />
              )}
            </View>
            <View style={styles.textContainer}>
              <Text size="xs" weight="semibold" numberOfLines={1}>
                {toast.title}
              </Text>
            </View>
            <View style={styles.rightSection}>
              {hasMultiple && (
                <Pressable onPress={onNext} style={[styles.counterBadge, { backgroundColor: badgeBackground }]}>
                  <Text size="xs" weight="bold" style={styles.counterText}>
                    {currentIndex + 1}/{totalCount}
                  </Text>
                </Pressable>
              )}
              {toast.type === "loading" && (
                <View style={[styles.timerContainer, { backgroundColor: timerBackground }]}>
                  <Text size="xs" weight="medium" style={styles.timerText}>
                    {formatElapsedTime(elapsedMs)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ToastWrapper>
        )}
      </Pressable>
    </Animated.View>
  );
};

/**
 * Toast Container - renders only the current toast with navigation
 */
interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export const ToastContainer = ({ toasts, onDismiss }: ToastContainerProps) => {
  if (toasts.length === 0) return null;

  // Show oldest toast first (first in array), newest are queued
  const currentToast = toasts[0];

  const handleNext = () => {
    // Dismiss current (oldest) to show next in queue
    if (toasts.length > 1) {
      onDismiss(currentToast.id);
    }
  };

  return (
    <Toast
      key={currentToast.id}
      toast={currentToast}
      onDismiss={onDismiss}
      currentIndex={0}
      totalCount={toasts.length}
      onNext={handleNext}
    />
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
    flexShrink: 1,
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
  closeButton: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
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
}));
