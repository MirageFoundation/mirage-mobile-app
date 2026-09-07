import { useRef } from "react";
import { Animated, Pressable, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type CommunityChipSize = "sm" | "md" | "lg";

const SIZE_CONFIG: Record<CommunityChipSize, { height: number; paddingHorizontal: number; fontSize: "xs" | "sm" | "md"; iconSize: number }> = {
  sm: { height: 24, paddingHorizontal: 8, fontSize: "xs", iconSize: 12 },
  md: { height: 30, paddingHorizontal: 12, fontSize: "sm", iconSize: 14 },
  lg: { height: 36, paddingHorizontal: 16, fontSize: "md", iconSize: 16 },
};

type CommunityChipProps = {
  /** Community label */
  label: string;
  /** Whether the chip is selected */
  selected?: boolean;
  /** Callback when chip is pressed */
  onPress?: () => void;
  /** Size variant */
  size?: CommunityChipSize;
  /** Show icon prefix */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Whether the chip can be removed */
  removable?: boolean;
  /** Callback when remove is pressed */
  onRemove?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
};

export const CommunityChip = ({
  label,
  selected = false,
  onPress,
  size = "md",
  icon,
  removable = false,
  onRemove,
  disabled = false,
  style,
}: CommunityChipProps) => {
  const { theme } = useUnistyles();
  const scale = useRef(new Animated.Value(1)).current;

  const { height, paddingHorizontal, fontSize, iconSize } = SIZE_CONFIG[size];

  const handlePressIn = () => {
    if (disabled) return;
    triggerHaptic("selection");
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
    if (disabled) return;
    onPress?.();
  };

  const handleRemove = () => {
    if (disabled) return;
    triggerHaptic("light");
    onRemove?.();
  };

  styles.useVariants({ selected });

  const textColor = selected 
    ? theme.colors.background.default 
    : theme.colors.text.default;
  const iconColor = selected 
    ? theme.colors.background.default 
    : theme.colors.text.subtle;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
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
        {icon && (
          <Ionicons 
            name={icon} 
            size={iconSize} 
            color={iconColor} 
            style={{ marginRight: 4 }}
          />
        )}
        <Text size={fontSize} weight="medium" style={{ color: textColor }}>
          {label}
        </Text>
        {removable && (
          <Pressable
            onPress={handleRemove}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            style={{ marginLeft: 4 }}
          >
            <Ionicons 
              name="close" 
              size={iconSize} 
              color={iconColor}
            />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.full,
    variants: {
      selected: {
        true: {
          backgroundColor: theme.colors.primary[500],
          borderWidth: 1,
          borderColor: theme.colors.primary[500],
        },
        false: {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        },
      },
    },
  },
  disabled: {
    opacity: 0.5,
  },
}));

