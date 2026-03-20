import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export type ContentWarningType = 
  | "sensitive" 
  | "porn" 
  | "violence" 
  | "gore" 
  | "death"
  | "nsfw";

type ContentWarningBadgeProps = {
  /** Warning types to display */
  types: ContentWarningType[];
  /** Size variant */
  size?: "sm" | "md";
  /** Callback when badge is pressed (e.g., to reveal content) */
  onPress?: () => void;
  /** Whether to show as a compact single badge */
  compact?: boolean;
};

const WARNING_CONFIG: Record<ContentWarningType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  sensitive: { label: "Sensitive", icon: "alert-circle", color: "warning" },
  porn: { label: "Porn", icon: "eye-off", color: "error" },
  violence: { label: "Violence", icon: "warning", color: "error" },
  gore: { label: "Gore", icon: "skull", color: "error" },
  death: { label: "Death", icon: "skull-outline", color: "error" },
  nsfw: { label: "NSFW", icon: "eye-off-outline", color: "error" },
};

export const ContentWarningBadge = ({
  types,
  size = "sm",
  onPress,
  compact = true,
}: ContentWarningBadgeProps) => {
  const { theme } = useUnistyles();

  if (types.length === 0) return null;

  const handlePress = () => {
    triggerHaptic("light");
    onPress?.();
  };

  const getColor = (colorKey: string) => {
    switch (colorKey) {
      case "warning":
        return theme.colors.warning[500];
      case "error":
        return theme.colors.error[500];
      default:
        return theme.colors.error[500];
    }
  };

  const iconSize = size === "sm" ? 12 : 14;
  const textSize = size === "sm" ? "xs" : "sm";

  // Compact mode: show single badge with primary warning
  if (compact) {
    const primaryType = types[0];
    const config = WARNING_CONFIG[primaryType];
    const badgeColor = getColor(config.color);
    const label = types.length > 1 
      ? `${config.label} +${types.length - 1}` 
      : config.label;

    const Wrapper = onPress ? Pressable : View;
    return (
      <Wrapper onPress={onPress ? handlePress : undefined}>
        <View 
          style={[
            styles.badge, 
            size === "sm" ? styles.badgeSm : styles.badgeMd,
            { backgroundColor: `${badgeColor}20`, borderColor: badgeColor }
          ]}
        >
          <Ionicons name={config.icon} size={iconSize} color={badgeColor} />
          <Text 
            size={textSize as any} 
            weight="medium" 
            style={{ color: badgeColor, marginLeft: 4 }}
          >
            {label}
          </Text>
        </View>
      </Wrapper>
    );
  }

  // Expanded mode: show all badges
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress ? handlePress : undefined}>
      <View style={styles.container}>
        {types.map((type) => {
          const config = WARNING_CONFIG[type];
          const badgeColor = getColor(config.color);

          return (
            <View 
              key={type}
              style={[
                styles.badge, 
                size === "sm" ? styles.badgeSm : styles.badgeMd,
                { backgroundColor: `${badgeColor}20`, borderColor: badgeColor }
              ]}
            >
              <Ionicons name={config.icon} size={iconSize} color={badgeColor} />
              <Text 
                size={textSize as any} 
                weight="medium" 
                style={{ color: badgeColor, marginLeft: 4 }}
              >
                {config.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Wrapper>
  );
};

/**
 * Single content warning chip (for use in selectors)
 */
type ContentWarningChipProps = {
  type: ContentWarningType;
  selected?: boolean;
  onPress?: () => void;
  size?: "sm" | "md";
};

export const ContentWarningChip = ({
  type,
  selected = false,
  onPress,
  size = "md",
}: ContentWarningChipProps) => {
  const { theme } = useUnistyles();
  const config = WARNING_CONFIG[type];

  const handlePress = () => {
    triggerHaptic("selection");
    onPress?.();
  };

  const iconSize = size === "sm" ? 14 : 16;
  const textSize = size === "sm" ? "xs" : "sm";
  const color = selected ? theme.colors.error[500] : theme.colors.text.subtle;

  return (
    <Pressable onPress={handlePress}>
      <View 
        style={[
          styles.chip,
          size === "sm" ? styles.chipSm : styles.chipMd,
          selected && styles.chipSelected,
        ]}
      >
        <Ionicons name={config.icon} size={iconSize} color={color} />
        <Text 
          size={textSize as any}
          weight={selected ? "semibold" : "medium"}
          style={{ color, marginLeft: 6 }}
        >
          {config.label}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    overflow: "hidden",
  },
  badgeSm: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  badgeMd: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: "transparent",
  },
  chipSm: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  chipMd: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipSelected: {
    borderColor: theme.colors.error[500],
    backgroundColor: `${theme.colors.error[500]}10`,
  },
}));
