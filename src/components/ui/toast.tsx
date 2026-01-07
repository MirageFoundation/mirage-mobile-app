/**
 * Toast Component
 *
 * A notification toast that appears at the top of the screen.
 * Supports loading, success, error, and info states with animations.
 */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "./primitives";

/**
 * Format elapsed time in a human-readable way
 * Shows seconds with one decimal place (0.0s, 0.1s, 0.2s, ... 1.0s, 1.1s, etc.)
 */
const formatElapsedTime = (ms: number): string => {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  // Show minutes and seconds for longer durations
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
};

export type ToastType = "loading" | "success" | "error" | "info";

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number; // 0 means persistent (for loading)
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
  index: number; // Position in stack (0 = newest, top-most)
  total: number; // Total number of toasts
}

const ICON_MAP: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  loading: "sync",
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

// Constants for stacked toast appearance
const TOAST_HEIGHT = 56; // Approximate height of a toast
const TOAST_GAP = 10; // Gap between stacked toasts
const MAX_VISIBLE_TOASTS = 4; // Maximum toasts to show at once

export const Toast = ({ toast, onDismiss, index }: ToastProps) => {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [elapsedMs, setElapsedMs] = useState(0);

  // Calculate the vertical offset based on position in stack
  // Index 0 = newest (top), higher index = older (below)
  const stackOffset = index * (TOAST_HEIGHT + TOAST_GAP);

  // Slightly reduce opacity and scale for older toasts to create depth effect
  const stackOpacity = Math.max(0.6, 1 - index * 0.15);
  const stackScale = Math.max(0.92, 1 - index * 0.03);

  // Entrance animation - also handles repositioning when index changes
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: stackOffset,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: stackOpacity,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, stackOffset, stackOpacity]);

  // Elapsed time counter for loading toasts (updates every 100ms)
  useEffect(() => {
    if (toast.type === "loading") {
      const interval = setInterval(() => {
        setElapsedMs((prev) => prev + 100);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [toast.type]);

  // Auto dismiss
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100 + stackOffset, // Exit upward from current position
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
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
        return theme.colors.text.default;
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
        return theme.colors.border.default;
    }
  };

  // Don't render if beyond max visible
  if (index >= MAX_VISIBLE_TOASTS) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 8,
          transform: [{ translateY }, { scale: stackScale }],
          opacity,
          zIndex: 9999 - index, // Newest on top
        },
      ]}
    >
      <Pressable onPress={toast.type !== "loading" ? handleDismiss : undefined}>
        <BlurView
          intensity={80}
          tint="dark"
          style={[styles.blurContainer, { borderColor: getBorderColor() }]}
        >
          <View style={styles.content}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              {toast.type === "loading" ? (
                <ActivityIndicator size="small" color={getIconColor()} />
              ) : (
                <Ionicons
                  name={ICON_MAP[toast.type]}
                  size={22}
                  color={getIconColor()}
                />
              )}
            </View>

            {/* Text content */}
            <View style={styles.textContainer}>
              <Text size="sm" weight="semibold" numberOfLines={1}>
                {toast.title}
              </Text>
              {toast.description && (
                <Text size="xs" mode="subtle" numberOfLines={2}>
                  {toast.description}
                </Text>
              )}
            </View>

            {/* Right side: elapsed time for loading, dismiss button for others */}
            {toast.type === "loading" ? (
              <View style={styles.timerContainer}>
                <Text size="sm" weight="medium" style={styles.timerText}>
                  {formatElapsedTime(elapsedMs)}
                </Text>
              </View>
            ) : (
              <Pressable onPress={handleDismiss} style={styles.closeButton}>
                <Ionicons
                  name="close"
                  size={18}
                  color={theme.colors.text.subtle}
                />
              </Pressable>
            )}
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
};

/**
 * Toast Container - renders all active toasts in a stack
 * Newest toast appears at the top (index 0), older toasts stack below
 */
interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export const ToastContainer = ({ toasts, onDismiss }: ToastContainerProps) => {
  if (toasts.length === 0) return null;

  // Reverse the array so newest toast (last in array) is at index 0 (top)
  const reversedToasts = [...toasts].reverse();
  const total = reversedToasts.length;

  return (
    <>
      {reversedToasts.map((toast, index) => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          index={index}
          total={total}
        />
      ))}
    </>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  timerContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    minWidth: 52,
    alignItems: "center",
  },
  timerText: {
    color: theme.colors.text.subtle,
    fontVariant: ["tabular-nums"], // Monospace numbers for stable width
  },
}));
