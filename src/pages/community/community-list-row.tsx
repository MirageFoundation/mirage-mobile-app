import { useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import type { CommunitySummary } from "@/src/domain/communities";
import { communityLabel } from "@/src/domain/communities";
import { Text } from "@/src/components/ui/primitives";
import { formatCompactNumber } from "@/src/utils/format-number";
import { styles } from "./community-list-styles";

function summarizeCommunity(item: CommunitySummary): string {
  const parts = [`${formatCompactNumber(item.post_count ?? 0)} posts`];
  if (item.curated) parts.push("Curated");
  if (item.live_team_count > 0) {
    parts.push(`${formatCompactNumber(item.live_team_count)} teams`);
  }
  if (item.default_team?.name) {
    parts.push(`Default: ${item.default_team.name}`);
  }
  return parts.join(" · ");
}

export function CommunityListRow({
  item,
  isJoined,
  isLoading,
  onPress,
  onJoinToggle,
}: {
  item: CommunitySummary;
  isJoined: boolean;
  isLoading: boolean;
  onPress: () => void;
  onJoinToggle: () => void;
}) {
  const { theme } = useUnistyles();
  const summary = useMemo(() => summarizeCommunity(item), [item]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.communityRow,
        { borderBottomColor: theme.colors.border.subtle },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.communityInfo}>
        <View style={styles.communityNameRow}>
          <Text
            size="lg"
            weight="semibold"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {communityLabel(item.community)}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text size="md" mode="subtle">
            {summary}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onJoinToggle();
        }}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.joinButton,
          isJoined
            ? { borderColor: theme.colors.border.default }
            : { backgroundColor: theme.colors.text.default },
          pressed && { opacity: 0.7 },
          isLoading && { opacity: 0.5 },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator
            size="small"
            color={
              isJoined
                ? theme.colors.text.default
                : theme.colors.background.default
            }
          />
        ) : (
          <Text
            size="sm"
            weight="bold"
            style={{
              color: isJoined
                ? theme.colors.text.default
                : theme.colors.background.default,
            }}
          >
            {isJoined ? "Joined" : "Join"}
          </Text>
        )}
      </Pressable>
    </Pressable>
  );
}
