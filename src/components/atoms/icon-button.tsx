import { useRef } from "react";
import { Animated, Pressable, type PressableProps, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { triggerHaptic, type HapticFeedbackType } from "@/src/components/utils/haptics";

type IconButtonSize = "sm" | "md" | "lg";

const BUTTON_SIZES: Record<IconButtonSize, { button: number; icon: number }> = {
  sm: { button: 32, icon: 18 },
  md: { button: 40, icon: 22 },
  lg: { button: 48, icon: 26 },
};

type IconButtonProps = Omit<PressableProps, "accessibilityLabel" | "style"> & {
  /** Concise description announced by assistive technologies */
  accessibilityLabel: string;
  /** Ionicons icon name */
  name: keyof typeof Ionicons.glyphMap;
  /** Size preset */
  size?: IconButtonSize;
  /** Visual style variant */
  variant?: "default" | "filled" | "outline";
  /** Color mode */
  mode?: "default" | "primary" | "subtle" | "error" | "success" | "warning";
  /** Whether the button is in active/selected state */
  active?: boolean;
  /** Custom icon color (overrides mode) */
  color?: string;
  /** Haptic feedback type */
  haptics?: HapticFeedbackType;
  /** Container style */
  style?: StyleProp<ViewStyle>;
};

export const IconButton = ({
  name,
  size = "md",
  variant = "default",
  mode = "default",
  active = false,
  color,
  haptics = "selection",
  disabled,
  accessibilityRole = "button",
  accessibilityState,
  hitSlop,
  onPress,
  style,
  ...props
}: IconButtonProps) => {
  const { theme } = useUnistyles();
  const scale = useRef(new Animated.Value(1)).current;

  const { button: buttonSize, icon: iconSize } = BUTTON_SIZES[size];

  // Determine icon color
  const getIconColor = () => {
    if (color) return color;
    if (disabled) return theme.colors.text.subtle;
    
    if (active) {
      switch (mode) {
        case "primary":
          return theme.colors.primary[500];
        case "error":
          return theme.colors.error[500];
        case "success":
          return theme.colors.success[500];
        case "warning":
          return theme.colors.warning[500];
        default:
          return theme.colors.primary[500];
      }
    }

    switch (mode) {
      case "primary":
        return theme.colors.primary[500];
      case "subtle":
        return theme.colors.text.subtle;
      case "error":
        return theme.colors.error[500];
      case "success":
        return theme.colors.success[500];
      case "warning":
        return theme.colors.warning[500];
      default:
        return theme.colors.text.default;
    }
  };

  const handlePressIn = () => {
    triggerHaptic(haptics, Boolean(disabled));
    Animated.spring(scale, {
      toValue: 0.85,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  styles.useVariants({
    variant: variant === "default" ? undefined : variant,
    active,
  });

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityState={{
          ...accessibilityState,
          disabled: Boolean(disabled) || accessibilityState?.disabled,
          selected: active || accessibilityState?.selected,
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={Boolean(disabled)}
        hitSlop={hitSlop ?? Math.max(0, (44 - buttonSize) / 2)}
        style={[
          styles.container,
          { width: buttonSize, height: buttonSize },
          disabled && styles.disabled,
        ]}
        {...props}
      >
        <Ionicons name={name} size={iconSize} color={getIconColor()} />
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    variants: {
      variant: {
        default: {
          backgroundColor: "transparent",
        },
        filled: {
          backgroundColor: theme.colors.background.subtle,
        },
        outline: {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        },
      },
      active: {
        true: {},
        false: {},
      },
    },
  },
  disabled: {
    opacity: 0.5,
  },
}));
