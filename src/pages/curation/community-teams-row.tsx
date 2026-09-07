import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { CurationTeamSummary } from "@/src/domain/communities";
import { styles } from "./community-teams-styles";

export function CommunityTeamsRow({
  item,
  isViewerTeam,
  onPress,
}: {
  item: CurationTeamSummary;
  isViewerTeam: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const pins = Number(item.subscriber_count) || 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border.subtle },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.rowInfo}>
        <Text size="lg" weight="semibold" numberOfLines={1}>
          {item.name || `Team ${item.team_id}`}
        </Text>
        <Text size="sm" mode="subtle" numberOfLines={2}>
          {[
            `${item.member_count} curators`,
            `${pins} pin${pins === 1 ? "" : "s"}`,
            item.subscriber_only ? "Subscribers only" : null,
            item.tag || null,
            isViewerTeam ? "Your team" : null,
          ].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}
