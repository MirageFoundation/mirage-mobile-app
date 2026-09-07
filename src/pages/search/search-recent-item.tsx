import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";

import { Text } from "@/src/components/ui/primitives";
import type { RecentSearch } from "@/src/stores";
import { recentSearchLabel } from "./search-state";
import { styles } from "./search-styles";

type SearchRecentItemProps = {
  item: RecentSearch;
  index: number;
  textSubtleColor: string;
  onPress: (item: RecentSearch) => void;
  onRemove: (id: string) => void;
};

export function SearchRecentItem({
  item,
  index,
  textSubtleColor,
  onPress,
  onRemove,
}: SearchRecentItemProps) {
  const label = recentSearchLabel(item.query);
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(200)}
      layout={Layout.springify()}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Search ${label}`}
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          styles.recentSearchItem,
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.recentSearchLeft}>
          <Ionicons name="time-outline" size={18} color={textSubtleColor} />
          <Text size="md" style={{ flex: 1 }}>
            {label}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove recent search ${label}`}
          onPress={() => onRemove(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => [
            styles.clearButton,
            pressed && { opacity: 0.5 },
          ]}
        >
          <Ionicons name="close" size={18} color={textSubtleColor} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
