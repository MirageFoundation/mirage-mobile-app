import { useEffect, useRef } from "react";
import { View, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";

type StepStatus = "pending" | "in_progress" | "completed" | "error";

type StatusStepProps = {
  /** Label for the step */
  label: string;
  /** Current status of the step */
  status: StepStatus;
  /** Duration in seconds (for completed/in_progress steps) */
  duration?: number;
  /** Optional description text */
  description?: string;
  /** Whether this is the last step (no connecting line below) */
  isLast?: boolean;
};

export const StatusStep = ({
  label,
  status,
  duration,
  description,
  isLast = false,
}: StatusStepProps) => {
  const { theme } = useUnistyles();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for in_progress status
  useEffect(() => {
    if (status === "in_progress") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  // Spin animation for in_progress icon
  useEffect(() => {
    if (status === "in_progress") {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      );
      spin.start();
      return () => spin.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [status, spinAnim]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "completed":
        return "checkmark-circle";
      case "in_progress":
        return "sync";
      case "error":
        return "alert-circle";
      case "pending":
      default:
        return "ellipse-outline";
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "completed":
        return theme.colors.success[500];
      case "in_progress":
        return theme.colors.primary[500];
      case "error":
        return theme.colors.error[500];
      case "pending":
      default:
        return theme.colors.text.subtle;
    }
  };

  const getLineColor = () => {
    return status === "completed" 
      ? theme.colors.success[500] 
      : theme.colors.border.subtle;
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    return `${seconds.toFixed(1)}s`;
  };

  const iconColor = getStatusColor();
  const lineColor = getLineColor();

  return (
    <View style={styles.container}>
      {/* Left column: Icon and connecting line */}
      <View style={styles.leftColumn}>
        <Animated.View 
          style={[
            styles.iconContainer,
            { opacity: pulseAnim },
            status === "in_progress" && { transform: [{ rotate: spinInterpolate }] },
          ]}
        >
          <Ionicons name={getStatusIcon()} size={24} color={iconColor} />
        </Animated.View>
        
        {!isLast && (
          <View style={[styles.line, { backgroundColor: lineColor }]} />
        )}
      </View>

      {/* Right column: Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text 
            size="md" 
            weight={status === "in_progress" ? "semibold" : "medium"}
            style={{ 
              color: status === "pending" 
                ? theme.colors.text.subtle 
                : theme.colors.text.default 
            }}
          >
            {label}
          </Text>
          {duration !== undefined && (
            <Text size="sm" mode="subtle">
              {formatDuration(duration)}
            </Text>
          )}
        </View>
        
        {description && (
          <Text size="sm" mode="subtle" style={styles.description}>
            {description}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    minHeight: 48,
  },
  leftColumn: {
    width: 32,
    alignItems: "center",
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    borderRadius: 1,
  },
  content: {
    flex: 1,
    paddingLeft: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  description: {
    marginTop: theme.spacing.xs,
  },
}));

