import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Menu, MenuOption, MenuOptions, MenuTrigger } from "react-native-popup-menu";
import { useUnistyles } from "react-native-unistyles";

import { FeedDensityOptions } from "@/src/components/molecules/feed-density-toggle";
import { Text } from "@/src/components/ui/primitives";
import { useFeedDensity } from "@/src/stores";
import { CommunityLensOptions, lensChoiceLabel, type CommunityLensChoice } from "./community-lens-picker";
import { styles } from "./community-feed-styles";

type SortBy = "magic" | "newest";
type Section = "main" | "sort" | "lens" | "view";

export type CommunityFeedMenuProps = {
  onSortChange: (value: SortBy) => void;
  sortBy: SortBy;
  sortOptions: { label: string; value: SortBy }[];
  lensChoice: CommunityLensChoice | null;
  teamOptions: { teamId: number; label: string }[];
  onLensChange: (choice: CommunityLensChoice) => void;
  onTeamsPress: () => void;
};

export function CommunityFeedMenu({
  onSortChange, sortBy, sortOptions, lensChoice, teamOptions, onLensChange, onTeamsPress,
}: CommunityFeedMenuProps) {
  const { theme } = useUnistyles();
  const [section, setSection] = useState<Section>("main");
  const [density] = useFeedDensity();
  const openSection = (next: Section) => {
    setSection(next);
    return false;
  };
  const row = (label: string, icon: keyof typeof Ionicons.glyphMap, selected = false) => (
    <View style={[styles.menuOption, { minHeight: 44 }]}>
      <Ionicons name={icon} size={18} color={selected ? theme.colors.primary[500] : theme.colors.text.subtle} />
      <Text size="md" weight={selected ? "semibold" : "medium"} style={{ flex: 1, color: selected ? theme.colors.primary[500] : theme.colors.text.default }}>
        {label}
      </Text>
    </View>
  );

  return (
    <Menu onClose={() => setSection("main")}>
      <MenuTrigger customStyles={{ triggerTouchable: { accessibilityRole: "button", accessibilityLabel: "Community options" } }}>
        <View style={styles.backButton}>
          <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text.default} />
        </View>
      </MenuTrigger>
      <MenuOptions customStyles={{
        optionsContainer: {
          backgroundColor: theme.colors.background.default,
          borderRadius: theme.radius.lg,
          width: 260,
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
      }}>
        <ScrollView style={{ maxHeight: 360 }}>
          {section === "main" ? (
            <>
              <MenuOption onSelect={() => openSection("sort")}>
                {row(`Sort: ${sortOptions.find((option) => option.value === sortBy)?.label ?? sortBy}`, "swap-vertical-outline")}
              </MenuOption>
              <MenuOption onSelect={() => openSection("lens")}>
                {row(`Lens: ${lensChoiceLabel(lensChoice, teamOptions)}`, "filter-outline")}
              </MenuOption>
              <MenuOption onSelect={onTeamsPress}>
                {row("Community teams", "people-outline")}
              </MenuOption>
              <MenuOption onSelect={() => openSection("view")}>
                {row(`View: ${density === "compact" ? "Compact" : "Card"}`, "albums-outline")}
              </MenuOption>
            </>
          ) : (
            <>
              <MenuOption onSelect={() => openSection("main")} accessibilityLabel="Back to community options">
                {row("Community options", "arrow-back")}
              </MenuOption>
              {section === "sort" && sortOptions.map((option) => (
                <MenuOption key={option.value} onSelect={() => onSortChange(option.value)}
                  customStyles={{ optionTouchable: { accessibilityRole: "radio", accessibilityLabel: option.label, accessibilityState: { checked: option.value === sortBy } } }}>
                  {row(option.label, option.value === sortBy ? "checkmark-circle" : "ellipse-outline", option.value === sortBy)}
                </MenuOption>
              ))}
              {section === "lens" && <CommunityLensOptions choice={lensChoice} teamOptions={teamOptions} onSelect={onLensChange} />}
              {section === "view" && <FeedDensityOptions />}
            </>
          )}
        </ScrollView>
      </MenuOptions>
    </Menu>
  );
}
