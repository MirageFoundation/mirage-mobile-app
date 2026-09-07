import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { communityLabel } from "@/src/domain/communities";
import { styles } from "./community-teams-styles";

export function CommunityTeamsHeader({
  insetsTop,
  communityName,
  onBack,
}: {
  insetsTop: number;
  communityName: string;
  onBack: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insetsTop,
          backgroundColor: theme.colors.background.default,
          borderBottomColor: theme.colors.border.subtle,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
        </Pressable>
        <Text size="xl" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
          Teams · {communityLabel(communityName)}
        </Text>
      </View>
    </View>
  );
}
