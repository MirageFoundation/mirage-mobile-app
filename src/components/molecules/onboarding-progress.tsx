import { useEffect, useRef, useState } from "react";
import { View, Animated } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { StatusStep } from "@/src/components/atoms";
import { Box, Text, ProgressBar } from "@/src/components/ui/primitives";

type StepStatus = "pending" | "active" | "complete" | "error";

type OnboardingStep = {
  id: string;
  label: string;
  status: StepStatus;
  duration?: number; // Duration in seconds
};

type OnboardingProgressProps = {
  /** Array of steps to display */
  steps: OnboardingStep[];
  /** Current status message to show in the banner */
  statusMessage?: string;
  /** Current step elapsed time in seconds */
  elapsedTime?: number;
  /** Title shown above the steps */
  title?: string;
  /** Subtitle/description */
  subtitle?: string;
};

export const OnboardingProgress = ({
  steps,
  statusMessage,
  elapsedTime = 0,
  title = "Creating Account",
  subtitle,
}: OnboardingProgressProps) => {
  const { theme } = useUnistyles();
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for active step
  useEffect(() => {
    const animation = Animated.loop(
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
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case "complete":
        return (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={theme.colors.success[500]}
          />
        );
      case "active":
        return (
          <Animated.View style={{ opacity: pulseOpacity }}>
            <Ionicons
              name="sync"
              size={20}
              color={theme.colors.primary[500]}
            />
          </Animated.View>
        );
      case "error":
        return (
          <Ionicons
            name="close-circle"
            size={20}
            color={theme.colors.error[500]}
          />
        );
      default:
        return (
          <Ionicons
            name="ellipse-outline"
            size={20}
            color={theme.colors.text.subtle}
          />
        );
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 0.1) return "–.–s";
    return `${seconds.toFixed(1)}s`;
  };

  // Calculate overall progress
  const completedSteps = steps.filter((s) => s.status === "complete").length;
  const activeStepIndex = steps.findIndex((s) => s.status === "active");
  const progress =
    activeStepIndex >= 0
      ? (completedSteps + 0.5) / steps.length
      : completedSteps / steps.length;

  return (
    <View style={styles.container}>
      {/* Status banner */}
      {statusMessage && (
        <View style={styles.statusBanner}>
          <Animated.View style={{ opacity: pulseOpacity }}>
            <Ionicons
              name="radio-button-on"
              size={10}
              color={theme.colors.brand[500]}
            />
          </Animated.View>
          <Text size="xs" mode="subtle" style={{ marginLeft: 8, flex: 1 }}>
            {statusMessage}
          </Text>
          {elapsedTime > 0 && (
            <Text size="xs" mode="subtle">
              ({formatDuration(elapsedTime)})
            </Text>
          )}
        </View>
      )}

      {/* Title */}
      <Box center style={{ marginVertical: 16 }}>
        <Text size="xl" weight="bold">
          {title}
        </Text>
        {subtitle && (
          <Text size="sm" mode="subtle" style={{ marginTop: 4 }}>
            {subtitle}
          </Text>
        )}
      </Box>

      {/* Steps list */}
      <View style={styles.stepsContainer}>
        {steps.map((step, index) => (
          <View key={step.id} style={styles.stepRow}>
            {/* Step icon */}
            <View style={styles.stepIcon}>{getStepIcon(step.status)}</View>

            {/* Step content */}
            <View style={styles.stepContent}>
              <Text
                size="sm"
                weight={step.status === "active" ? "semibold" : "regular"}
                style={
                  step.status === "pending"
                    ? { color: theme.colors.text.subtle }
                    : undefined
                }
              >
                {step.label}
              </Text>

              {/* Progress bar for active step */}
              {step.status === "active" && (
                <ProgressBar
                  progress={0.4} // Indeterminate-ish
                  size="sm"
                  animated
                  style={{ marginTop: 8 }}
                />
              )}

              {/* Completed bar for complete steps */}
              {step.status === "complete" && (
                <View style={styles.completedBar} />
              )}
            </View>

            {/* Duration */}
            <Text size="xs" mode="subtle" style={styles.duration}>
              {step.status === "complete" && step.duration
                ? formatDuration(step.duration)
                : step.status === "active" && elapsedTime
                ? formatDuration(elapsedTime)
                : "–.–s"}
            </Text>
          </View>
        ))}
      </View>

      {/* Overall progress */}
      <View style={styles.overallProgress}>
        <ProgressBar progress={progress} size="md" animated />
        <Text size="xs" mode="subtle" style={{ marginTop: 8, textAlign: "center" }}>
          {Math.round(progress * 100)}% complete
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  stepsContainer: {
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    gap: theme.spacing.md,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepIcon: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  stepContent: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  completedBar: {
    height: 4,
    backgroundColor: theme.colors.success[500],
    borderRadius: 2,
    marginTop: 8,
  },
  duration: {
    marginLeft: theme.spacing.md,
    minWidth: 50,
    textAlign: "right",
  },
  overallProgress: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
}));

