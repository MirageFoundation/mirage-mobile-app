import {
  DownvoteFilledIcon,
  DownvoteOutlineIcon,
  UpvoteFilledIcon,
  UpvoteOutlineIcon,
} from "@/assets/figma-icons";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
  const scale = useRef(new Animated.Value(1)).current;
  const colorAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  const { icon: iconSize, gap } = SIZE_CONFIG[size];

  // Animate color change when active state changes
  useEffect(() => {
    Animated.spring(colorAnim, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
    }).start();
  }, [isActive, colorAnim]);

  const getActiveColor = () => {
    return type === "like"
      ? theme.colors.success[500]
      : theme.colors.error[500];
  };

  const handlePressIn = () => {
    triggerHaptic("light", disabled);
    Animated.spring(scale, {
      toValue: 0.8,
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 5,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;

    // Bounce animation
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.2,
        useNativeDriver: true,
        friction: 3,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
      }),
    ]).start();

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

  const iconColor = isActive ? getActiveColor() : theme.colors.text.subtle;
  const textColor = isActive ? getActiveColor() : theme.colors.text.subtle;

  const renderIcon = () => {
    if (type === "like") {
      return isActive ? (
        <UpvoteFilledIcon size={iconSize} color={iconColor} />
      ) : (
        <UpvoteOutlineIcon size={iconSize} color={iconColor} />
      );
    }
    return isActive ? (
      <DownvoteFilledIcon size={iconSize} color={iconColor} />
    ) : (
      <DownvoteOutlineIcon size={iconSize} color={iconColor} />
    );
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View
        style={[
          styles.container,
          { gap, transform: [{ scale }] },
          disabled && styles.disabled,
        ]}
      >
        {renderIcon()}
        {showCount && (
          <Text
            size={size === "lg" ? "md" : size === "md" ? "sm" : "xs"}
            weight="bold"
            style={{ color: textColor }}
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
