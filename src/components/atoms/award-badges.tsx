import { memo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { getAwardInfo } from "@/src/data/awards";
import type { AwardBadge } from "@/src/api/types";

type AwardBadgesProps = {
  awards: AwardBadge[];
  size?: "sm" | "md";
};

export const AwardBadges = memo(function AwardBadges({
  awards,
  size = "sm",
}: AwardBadgesProps) {
  if (!awards || awards.length === 0) return null;

  const { theme } = useUnistyles();
  const textSize = size === "sm" ? "sm" : "md";
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <View style={styles.container}>
      <View style={styles.label}>
        <Ionicons
          name="gift-outline"
          size={size === "sm" ? 16 : 18}
          color={theme.colors.text.subtle}
        />
        <Text size="sm" mode="subtle" weight="semibold">
          Rewards{" · "}
        </Text>
      </View>
      {awards.map((award) => {
        const info = getAwardInfo(award.type);
        if (!info) return null;
        return (
          <View key={award.type} style={styles.badge}>
            <Text style={{ fontSize: iconSize, lineHeight: iconSize + 4 }}>
              {info.icon}
            </Text>
            {award.count > 1 && (
              <Text size={textSize} mode="subtle" weight="medium">
                {award.count}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginRight: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
}));
