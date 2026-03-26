/**
 * TransactionProgressModal
 *
 * A reusable modal for showing progress during blockchain transactions
 * that require Proof of Work (PoW) computation.
 *
 * Used for: Setting username, creating posts, voting, following, etc.
 *
 * Phases:
 * 1. Preparing - Fetching parameters
 * 2. Computing - PoW computation (with progress)
 * 3. Signing - Building and signing envelope
 * 4. Submitting - Sending to API
 * 5. Confirming - Polling for tx confirmation
 */

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Modal, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, ProgressBar, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

// ============================================
// Types
// ============================================

export type TransactionPhase =
  | "idle"
  | "waiting"
  | "preparing"
  | "computing"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

export interface TransactionProgress {
  /** Current phase of the transaction */
  phase: TransactionPhase;
  /** PoW progress (only during computing phase) */
  powProgress?: {
    attempts: number;
    elapsedMs: number;
    estimatedTotalMs: number;
  };
  /** Error message if phase is error */
  error?: string;
  /** Transaction hash (after submitting) */
  txHash?: string;
}

export interface TransactionProgressModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Current transaction progress */
  progress: TransactionProgress;
  /** Title shown in the modal */
  title?: string;
  /** Description shown below title */
  description?: string;
  /** Called when user dismisses error or success */
  onDismiss?: () => void;
  /** Called when user wants to retry after error */
  onRetry?: () => void;
  /** Whether the modal can be dismissed (only in success/error states) */
  dismissible?: boolean;
  /** Hide transaction hash on success (default: false) */
  showTxHash?: boolean;
  /** Auto-dismiss modal after success (ms delay, 0 to disable) */
  autoDismissDelay?: number;
}

// ============================================
// Phase Configuration
// ============================================

const PHASE_CONFIG: Record<
  TransactionPhase,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: "brand" | "success" | "error" | "warning";
  }
> = {
  idle: { label: "Ready", icon: "ellipse-outline", color: "brand" },
  waiting: { label: "Finishing up other actions first...", icon: "time-outline", color: "warning" },
  preparing: { label: "Preparing request...", icon: "sync", color: "brand" },
  computing: {
    label: "Securing your request...",
    icon: "shield-checkmark",
    color: "brand",
  },
  signing: { label: "Signing transaction...", icon: "key", color: "brand" },
  submitting: {
    label: "Submitting to network...",
    icon: "cloud-upload",
    color: "brand",
  },
  confirming: {
    label: "Confirming on blockchain...",
    icon: "checkmark-circle",
    color: "brand",
  },
  success: { label: "Success!", icon: "checkmark-circle", color: "success" },
  error: {
    label: "Something went wrong",
    icon: "close-circle",
    color: "error",
  },
};

// ============================================
// Component
// ============================================

export function TransactionProgressModal({
  visible,
  progress,
  title = "Processing Transaction",
  description,
  onDismiss,
  onRetry,
  dismissible = true,
  showTxHash = true,
  autoDismissDelay = 0,
}: TransactionProgressModalProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  // Animations
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  // Spin animation for loading states
  useEffect(() => {
    const isLoading = [
      "waiting",
      "preparing",
      "computing",
      "signing",
      "submitting",
      "confirming",
    ].includes(progress.phase);

    if (isLoading) {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spin.start();
      return () => spin.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [progress.phase, spinAnim]);

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Scale animation on mount
  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0.9);
    }
  }, [visible, scaleAnim]);

  // Haptic feedback on phase change
  useEffect(() => {
    if (progress.phase === "success") {
      triggerHaptic("success");
    } else if (progress.phase === "error") {
      triggerHaptic("error");
    }
  }, [progress.phase]);

  // Auto-dismiss on success
  useEffect(() => {
    if (progress.phase === "success" && autoDismissDelay > 0 && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoDismissDelay);
      return () => clearTimeout(timer);
    }
  }, [progress.phase, autoDismissDelay, onDismiss]);

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  const config = PHASE_CONFIG[progress.phase];

  // Calculate PoW progress percentage
  const powProgressPercent = useMemo(() => {
    if (!progress.powProgress || progress.powProgress.estimatedTotalMs === 0) {
      return 0;
    }
    const percent = Math.min(
      (progress.powProgress.elapsedMs / progress.powProgress.estimatedTotalMs) *
        100,
      95 // Cap at 95% to avoid showing 100% before completion
    );
    return Math.round(percent);
  }, [progress.powProgress]);

  // Format elapsed time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const canDismiss =
    dismissible && (progress.phase === "success" || progress.phase === "error");

  const handleDismiss = () => {
    if (canDismiss && onDismiss) {
      triggerHaptic("light");
      onDismiss();
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      triggerHaptic("medium");
      onRetry();
    }
  };

  // Icon color based on phase
  const iconColor =
    config.color === "success"
      ? theme.colors.success[500]
      : config.color === "error"
      ? theme.colors.error[500]
      : config.color === "warning"
      ? theme.colors.warning[500]
      : theme.colors.brand[500];

  const iconBgColor =
    config.color === "success"
      ? `${theme.colors.success[500]}20`
      : config.color === "error"
      ? `${theme.colors.error[500]}20`
      : config.color === "warning"
      ? `${theme.colors.warning[500]}20`
      : `${theme.colors.brand[500]}20`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <BlurView
          intensity={50}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={[
            styles.modal,
            {
              backgroundColor: isDark
                ? "rgba(25, 25, 25, 0.98)"
                : "rgba(255, 255, 255, 0.98)",
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Icon */}
          <View
            style={[styles.iconContainer, { backgroundColor: iconBgColor }]}
          >
            {progress.phase === "success" || progress.phase === "error" ? (
              <Ionicons name={config.icon} size={40} color={iconColor} />
            ) : progress.phase === "computing" || progress.phase === "waiting" ? (
              <Animated.View style={{ opacity: pulseOpacity }}>
                <MaterialCommunityIcons
                  name={progress.phase === "waiting" ? "timer-sand" : "shield-lock"}
                  size={40}
                  color={iconColor}
                />
              </Animated.View>
            ) : (
              <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
                <Ionicons name="sync" size={40} color={iconColor} />
              </Animated.View>
            )}
          </View>

          {/* Title */}
          <Text size="xl" weight="bold" style={styles.title}>
            {progress.phase === "success"
              ? "Success!"
              : progress.phase === "error"
              ? "Error"
              : progress.phase === "waiting"
              ? "Almost there"
              : title}
          </Text>

          {/* Phase label */}
          <Animated.View style={{ opacity: pulseOpacity }}>
            <Text size="md" mode="subtle" style={styles.phaseLabel}>
              {config.label}
            </Text>
          </Animated.View>

          {/* PoW Progress (during computing phase) */}
          {progress.phase === "computing" && progress.powProgress && (
            <View style={styles.powContainer}>
              <ProgressBar
                progress={powProgressPercent}
                size="md"
                mode="brand"
                animated
              />

              <View style={styles.powStats}>
                <Text size="xs" mode="subtle">
                  {progress.powProgress.attempts.toLocaleString()} attempts
                </Text>
                <Text size="xs" mode="subtle">
                  {formatTime(progress.powProgress.elapsedMs)} elapsed
                </Text>
              </View>

              {/* Show hash rate */}
              {progress.powProgress.elapsedMs > 1000 && (
                <Text
                  size="xs"
                  mode="subtle"
                  style={{ textAlign: "center", marginTop: 4 }}
                >
                  {(
                    progress.powProgress.attempts /
                    (progress.powProgress.elapsedMs / 1000)
                  ).toFixed(1)}{" "}
                  hashes/sec
                </Text>
              )}

              <Text size="xs" mode="subtle" style={styles.powHint}>
                This may take 1-5 minutes on mobile devices
              </Text>
            </View>
          )}

          {/* Description or Error */}
          {progress.phase === "waiting" ? (
            <Text size="sm" mode="subtle" style={styles.description}>
              A vote or other action is still processing.{" "}
              {title} will begin as soon as it finishes.
            </Text>
          ) : progress.phase === "error" && progress.error ? (
            <Text size="sm" mode="subtle" style={styles.errorText}>
              {progress.error}
            </Text>
          ) : description && progress.phase !== "success" ? (
            <Text size="sm" mode="subtle" style={styles.description}>
              {description}
            </Text>
          ) : null}

          {/* Success message */}
          {progress.phase === "success" && (
            <Text size="sm" mode="subtle" style={styles.successText}>
              Your transaction has been confirmed on the blockchain.
            </Text>
          )}

          {/* Buttons */}
          {canDismiss && progress.phase === "error" && (
            <Box gap="sm" style={styles.buttons}>
              {onRetry && (
                <Button
                  size="lg"
                  variant="outline"
                  rounded="full"
                  onPress={handleRetry}
                  style={styles.button}
                >
                  <Button.Text>Try Again</Button.Text>
                </Button>
              )}

              <Button
                size="lg"
                mode="brand"
                rounded="full"
                onPress={handleDismiss}
                style={[
                  styles.button,
                  { backgroundColor: "rgba(239, 68, 68, 0.9)" },
                ]}
              >
                <Button.Text style={{ color: "#fff" }}>
                  Close
                </Button.Text>
              </Button>
            </Box>
          )}

          {/* Non-dismissible hint */}
          {!canDismiss && (
            <Text size="xs" mode="subtle" style={styles.hint}>
              Please wait, don't close the app...
            </Text>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modal: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  phaseLabel: {
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  powContainer: {
    width: "100%",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  powStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.sm,
  },
  powHint: {
    textAlign: "center",
    marginTop: theme.spacing.sm,
    fontStyle: "italic",
  },
  description: {
    textAlign: "center",
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  errorText: {
    textAlign: "center",
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.error[500],
  },
  successText: {
    textAlign: "center",
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  txHashContainer: {
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  buttons: {
    width: "100%",
    marginTop: theme.spacing.sm,
  },
  button: {
    width: "100%",
  },
  hint: {
    textAlign: "center",
    marginTop: theme.spacing.md,
    fontStyle: "italic",
  },
}));
