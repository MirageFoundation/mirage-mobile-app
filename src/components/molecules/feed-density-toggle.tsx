import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useFeedDensity, type FeedDensity } from "@/src/stores";

type DensityOption = {
  value: FeedDensity;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const OPTIONS: DensityOption[] = [
  { value: "card", label: "Card view", icon: "albums-outline" },
  { value: "compact", label: "Compact view", icon: "list-outline" },
];

type FeedDensityToggleProps = {
  /** Optional icon override for the trigger */
  iconSize?: number;
};

export const FeedDensityToggle = ({ iconSize = 22 }: FeedDensityToggleProps) => {
  const { theme } = useUnistyles();
  const [density, setDensity] = useFeedDensity();

  const triggerIcon: keyof typeof Ionicons.glyphMap =
    density === "compact" ? "list-outline" : "albums-outline";

  return (
    <Menu>
      <MenuTrigger
        customStyles={{
          triggerTouchable: {
            hitSlop: { top: 8, bottom: 8, left: 6, right: 6 },
          },
        }}
      >
        <View style={styles.trigger}>
          <Ionicons
            name={triggerIcon}
            size={iconSize}
            color={theme.colors.text.default}
          />
        </View>
      </MenuTrigger>
      <MenuOptions
        customStyles={{
          optionsContainer: {
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.radius.lg,
            minWidth: 180,
            shadowColor: theme.colors.contrast.base,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            marginTop: 4,
            paddingVertical: 4,
          },
        }}
      >
        {OPTIONS.map((option, index) => {
          const isActive = option.value === density;
          return (
            <View key={option.value}>
              {index > 0 && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: theme.colors.border.subtle,
                    marginHorizontal: theme.spacing.md,
                    marginVertical: 2,
                  }}
                />
              )}
              <MenuOption
                onSelect={() => {
                  if (option.value === density) return;
                  triggerHaptic("light");
                  setDensity(option.value);
                }}
              >
                <View style={styles.option}>
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={
                      isActive
                        ? theme.colors.primary[500]
                        : theme.colors.text.subtle
                    }
                  />
                  <Text
                    size="md"
                    weight={isActive ? "semibold" : "medium"}
                    style={
                      isActive
                        ? { color: theme.colors.primary[500], flex: 1 }
                        : { flex: 1 }
                    }
                  >
                    {option.label}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={theme.colors.primary[500]}
                    />
                  )}
                </View>
              </MenuOption>
            </View>
          );
        })}
      </MenuOptions>
    </Menu>
  );
};

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
}));
