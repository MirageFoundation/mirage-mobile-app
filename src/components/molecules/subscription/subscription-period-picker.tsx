import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  clampPeriodCount,
  MAX_SUBSCRIPTION_PERIOD_COUNT,
  MIN_SUBSCRIPTION_PERIOD_COUNT,
} from "@/src/domain/subscriptions";

type SubscriptionPeriodPickerProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export const SubscriptionPeriodPicker = memo(function SubscriptionPeriodPicker({
  value,
  onChange,
  disabled,
}: SubscriptionPeriodPickerProps) {
  const { theme } = useUnistyles();
  const periodCount = clampPeriodCount(value);

  const adjust = useCallback(
    (delta: number) => {
      if (disabled) return;
      const next = clampPeriodCount(periodCount + delta);
      if (next === periodCount) return;
      triggerHaptic("selection");
      onChange(next);
    },
    [disabled, onChange, periodCount],
  );

  return (
    <Box direction="row" alignItems="center" justifyContent="space-between" style={styles.row}>
      <Text size="sm" weight="medium">
        Periods
      </Text>
      <Box direction="row" alignItems="center" gap="sm">
        <Pressable
          onPress={() => adjust(-1)}
          disabled={disabled || periodCount <= MIN_SUBSCRIPTION_PERIOD_COUNT}
          style={({ pressed }) => [
            styles.stepper,
            { borderColor: theme.colors.border.subtle },
            pressed && { opacity: 0.7 },
            (disabled || periodCount <= MIN_SUBSCRIPTION_PERIOD_COUNT) && { opacity: 0.4 },
          ]}
        >
          <Ionicons name="remove" size={16} color={theme.colors.text.default} />
        </Pressable>
        <Text size="md" weight="semibold" style={styles.value}>
          {periodCount}
        </Text>
        <Pressable
          onPress={() => adjust(1)}
          disabled={disabled || periodCount >= MAX_SUBSCRIPTION_PERIOD_COUNT}
          style={({ pressed }) => [
            styles.stepper,
            { borderColor: theme.colors.border.subtle },
            pressed && { opacity: 0.7 },
            (disabled || periodCount >= MAX_SUBSCRIPTION_PERIOD_COUNT) && { opacity: 0.4 },
          ]}
        >
          <Ionicons name="add" size={16} color={theme.colors.text.default} />
        </Pressable>
      </Box>
    </Box>
  );
});

const styles = StyleSheet.create((theme) => ({
  row: {
    paddingVertical: theme.spacing.xs,
  },
  stepper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    minWidth: 24,
    textAlign: "center",
  },
}));
