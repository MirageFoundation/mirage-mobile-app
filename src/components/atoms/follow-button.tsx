import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useRef } from "react";
import { ActivityIndicator, Animated, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type FollowButtonSize = "sm" | "md" | "lg";

const SIZE_CONFIG: Record<FollowButtonSize, { height: number; paddingHorizontal: number; fontSize: "xs" | "sm" | "md" }> = {
  sm: { height: 22, paddingHorizontal: 8, fontSize: "xs" },
  md: { height: 26, paddingHorizontal: 10, fontSize: "xs" },
  lg: { height: 32, paddingHorizontal: 14, fontSize: "sm" },
};

type FollowButtonProps = {
  /** Whether currently following this user */
  isFollowing: boolean;
  /** Callback when button is pressed */
  onPress?: () => void;
  /** Size variant */
  size?: FollowButtonSize;
  /** Whether the action is in progress */
  loading?: boolean;
  /** Disabled state */
  disabled?: boolean;
};

export const FollowButton = ({
  isFollowing,
  onPress,
  size = "md",
  loading = false,
  disabled = false,
}: FollowButtonProps) => {
  const { theme } = useUnistyles();
  const scale = useRef(new Animated.Value(1)).current;

  const { height, paddingHorizontal, fontSize } = SIZE_CONFIG[size];

  const handlePressIn = () => {
    triggerHaptic("selection", disabled || loading);
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (disabled || loading) return;
    triggerHaptic(isFollowing ? "light" : "medium");
    onPress?.();
  };

  styles.useVariants({ isFollowing });

  const buttonText = isFollowing ? "Following" : "Follow";
  const textColor = isFollowing 
    ? theme.colors.text.default 
    : theme.colors.background.default;

  // When loading, just show the activity indicator without container styling
  if (loading) {
    return (
      <Animated.View 
        style={{ 
          transform: [{ scale }],
          height,
          minWidth: 54,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator 
          size="small" 
          color={theme.colors.text.subtle} 
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        style={[
          styles.container,
          { height, paddingHorizontal },
          disabled && styles.disabled,
        ]}
      >
        <Text 
          size={fontSize} 
          weight="semibold"
          style={{ color: textColor }}
        >
          {buttonText}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    minWidth: 54,
    variants: {
      isFollowing: {
        true: {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: theme.colors.border.default,
        },
        false: {
          backgroundColor: theme.colors.primary[500],
          borderWidth: 1,
          borderColor: theme.colors.primary[500],
        },
      },
    },
  },
  disabled: {
    opacity: 0.6,
  },
}));

