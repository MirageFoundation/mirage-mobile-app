import {
  DownvoteFilledIcon,
  UpvoteFilledIcon,
} from "@/assets/figma-icons";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { getVoteColor } from "./vote-button-state";

type VoteButtonProps = {
  /** Vote type: like (upvote) or dislike (downvote) */
  type: "like" | "dislike";
  /** Current vote count */
  count: number;
  /** Whether the user has voted this way */
  isActive?: boolean;
  /** Callback when button is pressed */
  onPress?: () => void;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether to show the count */
  showCount?: boolean;
  /** Disabled state */
  disabled?: boolean;
};

const SIZE_CONFIG = {
  sm: { icon: 16, gap: 2 },
  md: { icon: 20, gap: 4 },
  lg: { icon: 24, gap: 6 },
};

export const VoteButton = ({
  type,
  count,
  isActive = false,
  onPress,
  size = "md",
  showCount = true,
  disabled = false,
}: VoteButtonProps) => {
  const { theme } = useUnistyles();
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const { icon: iconSize, gap } = SIZE_CONFIG[size];
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    triggerHaptic("light", disabled);
    scale.value = reducedMotion
      ? 0.8
      : withSpring(0.8, { damping: 12, stiffness: 220 });
  };

  const handlePressOut = () => {
    scale.value = reducedMotion
      ? 1
      : withSpring(1, { damping: 12, stiffness: 220 });
  };

  const handlePress = () => {
    if (disabled) return;

    scale.value = reducedMotion
      ? 1
      : withSequence(
          withSpring(1.2, { damping: 9, stiffness: 220 }),
          withSpring(1, { damping: 12, stiffness: 220 }),
        );

    triggerHaptic(isActive ? "light" : "medium");
    onPress?.();
  };

  // Format count for display (e.g., 1234 -> 1.2K)
  const formatCount = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  // Keep SVG and text colors atomic; custom icon props are not safe UI-thread targets.
  const color = getVoteColor(type, isActive, {
    inactive: theme.colors.text.subtle,
    like: theme.colors.success[500],
    dislike: theme.colors.error[500],
  });

  const renderIcon = () => {
    if (type === "like") {
      return <UpvoteFilledIcon size={iconSize} color={color} />;
    }
    return <DownvoteFilledIcon size={iconSize} color={color} />;
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: isActive }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View
        style={[
          styles.container,
          { gap },
          scaleStyle,
          disabled && styles.disabled,
        ]}
      >
        {renderIcon()}
        {showCount && (
          <Text
            size={size === "lg" ? "md" : size === "md" ? "sm" : "xs"}
            weight="bold"
            style={{ color }}
          >
            {formatCount(count)}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.5,
  },
}));
