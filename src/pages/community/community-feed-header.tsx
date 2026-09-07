import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { communityLabel } from "@/src/domain/communities";
import { CommunityFeedMenu, type CommunityFeedMenuProps } from "./community-feed-menu";
import { styles } from "./community-feed-styles";

type CommunityFeedHeaderProps = CommunityFeedMenuProps & {
  insetsTop: number;
  communityName?: string;
  isJoined: boolean;
  onBack: () => void;
  onJoinToggle: () => void;
};

export function CommunityFeedHeader({
  insetsTop,
  communityName,
  isJoined,
  onBack,
  onJoinToggle,
  ...menuProps
}: CommunityFeedHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View
      style={[
        styles.headerContainer,
        {
          paddingTop: insetsTop,
          backgroundColor: theme.colors.background.default,
          borderBottomColor: theme.colors.border.subtle,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
      </Pressable>
      <Text
        size="xl"
        weight="bold"
        numberOfLines={1}
        ellipsizeMode="tail"
        accessibilityRole="header"
        accessibilityLabel={communityLabel(communityName)}
        style={styles.headerTitle}
      >
        {communityLabel(communityName)}
      </Text>
      <Pressable
        onPress={onJoinToggle}
        accessibilityRole="button"
        accessibilityLabel={`${isJoined ? "Leave" : "Join"} ${communityLabel(communityName)}`}
        style={styles.headerJoinTarget}
      >
        <View
          style={[
            styles.headerJoinButton,
            {
              backgroundColor: isJoined ? "transparent" : theme.colors.primary[500],
              borderColor: isJoined ? theme.colors.border.default : theme.colors.primary[500],
              paddingVertical: 2,
            },
          ]}
        >
          <Text
            size="md"
            weight="bold"
            style={{ color: isJoined ? theme.colors.text.default : theme.colors.background.default }}
          >
            {isJoined ? "Joined" : "Join"}
          </Text>
        </View>
      </Pressable>
      <CommunityFeedMenu {...menuProps} />
    </View>
  );
}
