import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";

type ActivePlanCardProps = {
  /** Current plan tier: Free, Trusted, Established, Distinguished */
  planTitle: string;
  /** User's MIRAGE balance */
  balance: number;
  /** User's MIRAGE reserve */
  reserve: number;
};

// Plan colors for visual distinction
const PLAN_COLORS: Record<string, string> = {
  Free: "#6B7280", // Gray
  Trusted: "#3B82F6", // Blue
  Established: "#8B5CF6", // Purple
  Distinguished: "#F59E0B", // Amber/Gold
};

// Plan icons
const PLAN_ICONS: Record<string, string> = {
  Free: "person-outline",
  Trusted: "shield-checkmark-outline",
  Established: "star-outline",
  Distinguished: "diamond-outline",
};

export function ActivePlanCard({
  planTitle,
  balance,
  reserve,
}: ActivePlanCardProps) {
  const { theme } = useUnistyles();
  const planColor = PLAN_COLORS[planTitle] || PLAN_COLORS.Free;
  const planIcon = PLAN_ICONS[planTitle] || PLAN_ICONS.Free;

  return (
    <Box
      rounded="lg"
      p="md"
      style={[
        styles.container,
        { backgroundColor: theme.colors.background.default },
      ]}
    >
      {/* Plan Title with Icon */}
      <Box direction="row" alignItems="center" gap="sm">
        <Box
          center
          rounded="md"
          style={[styles.iconContainer, { backgroundColor: `${planColor}20` }]}
        >
          <Icon
            icon={Ionicons}
            name={planIcon as any}
            size={24}
            color={planColor}
          />
        </Box>
        <Box flex>
          <Text size="xs" mode="subtle" style={styles.label}>
            CURRENT PLAN
          </Text>
          <Text
            size="xxl"
            weight="semibold"
            style={{ color: theme.colors.text.default }}
          >
            {planTitle}
          </Text>
        </Box>
      </Box>

      {/* Divider */}
      <Divider style={styles.divider} size="extraThin" />

      {/* Balance & Reserve Stats */}
      <Box direction="row" gap="md">
        {/* Balance */}
        <Box flex>
          <Text size="xs" mode="subtle" style={styles.statLabel}>
            Balance
          </Text>
          <Box direction="row" alignItems="center" gap="xs">
            <Text size="xxl" weight="semibold">
              {balance.toLocaleString()}
            </Text>
            <Text size="md" mode="subtle" style={{ marginTop: 2 }}>
              MIRAGE
            </Text>
          </Box>
        </Box>

        {/* Vertical Divider */}
        <View
          style={[
            styles.verticalDivider,
            { backgroundColor: theme.colors.border.subtle },
          ]}
        />

        {/* Reserve */}
        <Box flex>
          <Text size="xs" mode="subtle" style={styles.statLabel}>
            Reserve
          </Text>
          <Box direction="row" alignItems="center" gap="xs">
            <Text size="xxl" weight="semibold">
              {reserve.toLocaleString()}
            </Text>
            <Text size="md" mode="subtle" style={{ marginTop: 2 }}>
              MIRAGE
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  iconContainer: {
    width: 48,
    height: 48,
  },
  label: {
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  divider: {
    marginVertical: theme.spacing.sm + 5,
  },
  statLabel: {
    marginBottom: 4,
  },
  verticalDivider: {
    width: 1,
    height: "100%",
  },
}));
