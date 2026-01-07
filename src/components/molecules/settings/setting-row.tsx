import { Ionicons } from "@expo/vector-icons";
import { Pressable, Switch } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type SettingRowBaseProps = {
  /** Icon name from Ionicons */
  icon?: string;
  /** Setting title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
};

type SettingRowToggleProps = SettingRowBaseProps & {
  type: "toggle";
  value: boolean;
  onValueChange: (value: boolean) => void;
  onPress?: never;
  rightText?: never;
};

type SettingRowNavigateProps = SettingRowBaseProps & {
  type: "navigate";
  onPress: () => void;
  rightText?: string;
  value?: never;
  onValueChange?: never;
};

type SettingRowValueProps = SettingRowBaseProps & {
  type: "value";
  onPress: () => void;
  rightText: string;
  value?: never;
  onValueChange?: never;
};

export type SettingRowProps =
  | SettingRowToggleProps
  | SettingRowNavigateProps
  | SettingRowValueProps;

export function SettingRow(props: SettingRowProps) {
  const { theme } = useUnistyles();
  const { icon, title, subtitle, type } = props;

  const handlePress = () => {
    if (type === "toggle") {
      triggerHaptic("light");
      props.onValueChange(!props.value);
    } else {
      triggerHaptic("light");
      props.onPress();
    }
  };

  const activeColor = "rgb(30,67,150)";

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
    >
      <Box direction="row" alignItems="flex-start" gap="md" flex>
        {icon && (
          <Ionicons
            name={icon as any}
            size={20}
            color={theme.colors.text.default}
            style={[
              styles.icon,
              type === "navigate" && {
                marginTop: 2,
                color: theme.colors.error[400],
              },
            ]}
          />
        )}
        <Box flex gap="xxs">
          <Text
            size="md"
            weight="regular"
            style={[
              styles.title,
              type === "navigate" && { color: theme.colors.error[400] },
            ]}
          >
            {title}
          </Text>
          {subtitle && (
            <Text size="sm" mode="subtle" style={styles.subtitle}>
              {subtitle}
            </Text>
          )}
        </Box>
      </Box>

      {/* Right content based on type */}
      {type === "toggle" && (
        <Switch
          value={props.value}
          onValueChange={(value) => {
            triggerHaptic("light");
            props.onValueChange(value);
          }}
          trackColor={{
            false: theme.colors.background.emphasis,
            true: activeColor,
          }}
          thumbColor="#FFFFFF"
        />
      )}

      {type === "navigate" && (
        <Box direction="row" alignItems="center" gap="xs">
          {props.rightText && (
            <Text size="sm" mode="subtle">
              {props.rightText}
            </Text>
          )}
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.text.subtle}
            // style={styles.icon}
          />
        </Box>
      )}

      {type === "value" && (
        <Box direction="row" alignItems="center" gap="xs">
          <Text size="sm" mode="subtle">
            {props.rightText}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.text.subtle}
          />
        </Box>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.background.default,
  },
  icon: {
    marginTop: 5,
  },
  title: {
    color: theme.colors.text.default,
  },
  subtitle: {
    lineHeight: 16,
  },
}));
