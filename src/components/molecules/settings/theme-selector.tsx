import { Ionicons } from "@expo/vector-icons";
import { Pressable, Switch } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { ThemeMode } from "@/src/stores/preferences-store";

type ThemeSelectorProps = {
  value: ThemeMode;
  onChange: (value: ThemeMode) => void;
};

export function ThemeSelector({ value, onChange }: ThemeSelectorProps) {
  const { theme } = useUnistyles();

  const isAutomatic = value === "system";
  const isDarkMode = value === "dark";

  const activeColor = "rgb(30,67,149)";

  const handleAutomaticToggle = (enabled: boolean) => {
    triggerHaptic("light");
    if (enabled) {
      onChange("system");
    } else {
      // If turning off automatic, default to light
      onChange("light");
    }
  };

  const handleDarkModeToggle = (enabled: boolean) => {
    triggerHaptic("light");
    if (enabled) {
      onChange("dark");
    } else {
      // If turning off dark mode, default to light
      onChange("light");
    }
  };

  return (
    <Box background="base">
      {/* Automatic Option */}
      <Pressable
        onPress={() => handleAutomaticToggle(!isAutomatic)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      >
        <Box direction="row" alignItems="center" gap="md" flex>
          <Ionicons
            name="phone-portrait-outline"
            size={20}
            color={theme.colors.text.default}
            style={styles.icon}
          />
          <Box flex gap="xs">
            <Text size="md" weight="regular">
              Automatic
            </Text>
            <Text size="sm" mode="subtle">
              Follow system setting
            </Text>
          </Box>
        </Box>
        <Switch
          value={isAutomatic}
          onValueChange={handleAutomaticToggle}
          trackColor={{
            false: theme.colors.background.emphasis,
            true: activeColor,
          }}
          thumbColor="#FFFFFF"
        />
      </Pressable>

      {/* Dark Mode Option */}
      <Pressable
        onPress={() => handleDarkModeToggle(!isDarkMode)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      >
        <Box direction="row" alignItems="flex-start" gap="md" flex>
          <Ionicons
            name="moon-outline"
            size={20}
            color={theme.colors.text.default}
            style={styles.icon}
          />
          <Box flex>
            <Text size="md" weight="regular">
              Dark Mode
            </Text>
          </Box>
        </Box>
        <Switch
          value={isDarkMode}
          onValueChange={handleDarkModeToggle}
          trackColor={{
            false: theme.colors.background.emphasis,
            true: activeColor,
          }}
          thumbColor="#FFFFFF"
        />
      </Pressable>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  icon: {},
}));
