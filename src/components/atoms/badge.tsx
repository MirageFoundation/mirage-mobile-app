import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";

type BadgeSize = "sm" | "md" | "lg";
type BadgeMode = "default" | "primary" | "error" | "success" | "warning";

type BadgeProps = {
  /** Count to display (will show "99+" for values > 99) */
  count?: number;
  /** Whether to show as a dot (ignores count) */
  dot?: boolean;
  /** Size variant */
  size?: BadgeSize;
  /** Color mode */
  mode?: BadgeMode;
  /** Maximum count before showing "+" suffix */
  maxCount?: number;
  /** Whether the badge is visible */
  visible?: boolean;
};

const SIZE_CONFIG: Record<BadgeSize, { minSize: number; padding: number; fontSize: "xs" | "sm" | "md"; dotSize: number }> = {
  sm: { minSize: 16, padding: 4, fontSize: "xs", dotSize: 8 },
  md: { minSize: 20, padding: 6, fontSize: "xs", dotSize: 10 },
  lg: { minSize: 24, padding: 8, fontSize: "sm", dotSize: 12 },
};

export const Badge = ({
  count,
  dot = false,
  size = "md",
  mode = "error",
  maxCount = 99,
  visible = true,
}: BadgeProps) => {
  const { theme } = useUnistyles();
  
  if (!visible) return null;
  
  // For dot mode, don't show count
  if (dot) {
    const { dotSize } = SIZE_CONFIG[size];
    return (
      <View 
        style={[
          styles.dot, 
          { 
            width: dotSize, 
            height: dotSize,
            backgroundColor: getBadgeColor(mode, theme),
          }
        ]} 
      />
    );
  }

  // Don't show badge if count is 0 or undefined
  if (count === undefined || count === 0) return null;

  const { minSize, padding, fontSize } = SIZE_CONFIG[size];
  const displayCount = count > maxCount ? `${maxCount}+` : count.toString();
  
  // Adjust width based on content length
  const isMultiDigit = displayCount.length > 1;
  const width = isMultiDigit ? "auto" : minSize;

  return (
    <View 
      style={[
        styles.container, 
        { 
          minWidth: minSize, 
          height: minSize,
          width,
          paddingHorizontal: isMultiDigit ? padding : 0,
          backgroundColor: getBadgeColor(mode, theme),
        }
      ]}
    >
      <Text 
        size={fontSize} 
        weight="bold" 
        style={{ color: theme.colors.background.default }}
      >
        {displayCount}
      </Text>
    </View>
  );
};

const getBadgeColor = (mode: BadgeMode, theme: any) => {
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
      return theme.colors.error[500];
  }
};

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  dot: {
    borderRadius: theme.radius.full,
  },
}));

/**
 * Wrapper component to position badge relative to another element
 */
type BadgeWrapperProps = {
  children: React.ReactNode;
  badge: BadgeProps;
  /** Position of the badge relative to the child */
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
};

export const BadgeWrapper = ({ 
  children, 
  badge, 
  position = "top-right" 
}: BadgeWrapperProps) => {
  const getPositionStyle = () => {
    switch (position) {
      case "top-right":
        return { top: -4, right: -4 };
      case "top-left":
        return { top: -4, left: -4 };
      case "bottom-right":
        return { bottom: -4, right: -4 };
      case "bottom-left":
        return { bottom: -4, left: -4 };
    }
  };

  return (
    <View style={styles.wrapper}>
      {children}
      <View style={[styles.badgePosition, getPositionStyle()]}>
        <Badge {...badge} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  dot: {
    borderRadius: theme.radius.full,
  },
  wrapper: {
    position: "relative",
  },
  badgePosition: {
    position: "absolute",
    zIndex: 1,
  },
}));

