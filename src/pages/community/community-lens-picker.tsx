import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";

import { Text } from "@/src/components/ui/primitives";
import type { CommunityDetail, CurationTeamSummary } from "@/src/domain/communities";
import { styles } from "./community-feed-styles";

export type CommunityLensChoice = {
  lens: "default" | "raw" | "team";
  team_id?: number | null;
};

export function collectDetailTeamLensOptions(detail?: CommunityDetail | null) {
  const options: { teamId: number; label: string }[] = [];
  const seen = new Set<number>();
  const add = (raw: string | number | null | undefined, label?: string) => {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    options.push({ teamId: id, label: label || `Team ${id}` });
  };
  if (detail?.default_team) {
    add(detail.default_team.team_id, detail.default_team.name);
  }
  add(detail?.stored_team_id);
  add(detail?.effective_team_id);
  return options;
}

export function collectTeamListLensOptions(
  teams?: readonly CurationTeamSummary[] | null,
) {
  const options: { teamId: number; label: string }[] = [];
  const seen = new Set<number>();
  for (const team of teams ?? []) {
    if (team.deleted) continue;
    const id = Number(team.team_id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    options.push({ teamId: id, label: team.name || `Team ${id}` });
  }
  return options;
}

export function lensChoiceLabel(
  choice: CommunityLensChoice | null,
  teamOptions: { teamId: number; label: string }[],
): string {
  if (!choice || choice.lens === "default") return "Default";
  if (choice.lens === "raw") return "Raw";
  const team = teamOptions.find((option) => option.teamId === choice.team_id);
  return team?.label ?? `Team ${choice.team_id}`;
}

export function CommunityLensPicker({
  choice,
  teamOptions,
  onSelect,
}: {
  choice: CommunityLensChoice | null;
  teamOptions: { teamId: number; label: string }[];
  onSelect: (choice: CommunityLensChoice) => void;
}) {
  const { theme } = useUnistyles();

  return (
    <Menu>
      <MenuTrigger
        customStyles={{
          triggerTouchable: {
            hitSlop: { top: 8, bottom: 8, left: 4, right: 4 },
          },
        }}
      >
        <View style={styles.titleButton}>
          <Text size="sm" mode="subtle" numberOfLines={1}>
            {lensChoiceLabel(choice, teamOptions)}
          </Text>
          <Ionicons
            name="chevron-down"
            size={12}
            color={theme.colors.text.subtle}
            style={{ marginLeft: 2 }}
          />
        </View>
      </MenuTrigger>
      <MenuOptions
        customStyles={{
          optionsContainer: {
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.radius.lg,
            minWidth: 160,
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
        <CommunityLensOptions choice={choice} teamOptions={teamOptions} onSelect={onSelect} />
      </MenuOptions>
    </Menu>
  );
}

export function CommunityLensOptions({ choice, teamOptions, onSelect }: {
  choice: CommunityLensChoice | null;
  teamOptions: { teamId: number; label: string }[];
  onSelect: (choice: CommunityLensChoice) => void;
}) {
  const { theme } = useUnistyles();
  const options: { label: string; value: CommunityLensChoice }[] = [
    { label: "Default", value: { lens: "default", team_id: null } },
    { label: "Raw", value: { lens: "raw", team_id: null } },
    ...teamOptions.map((team) => ({
      label: team.label,
      value: { lens: "team" as const, team_id: team.teamId },
    })),
  ];
  return (
    <>
        {options.map((option, index) => {
          const isActive =
            (choice?.lens ?? "default") === option.value.lens &&
            (choice?.team_id ?? null) === (option.value.team_id ?? null);
          return (
            <View key={`${option.value.lens}:${option.value.team_id ?? 0}`}>
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
                onSelect={() => onSelect(option.value)}
                customStyles={{ optionTouchable: { accessibilityRole: "radio", accessibilityLabel: option.label, accessibilityState: { checked: isActive } } }}
              >
                <View style={styles.menuOption}>
                  <Ionicons
                    name={isActive ? "checkmark-circle" : "ellipse-outline"}
                    size={16}
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
                        ? { color: theme.colors.primary[500] }
                        : undefined
                    }
                  >
                    {option.label}
                  </Text>
                </View>
              </MenuOption>
            </View>
          );
        })}
    </>
  );
}
