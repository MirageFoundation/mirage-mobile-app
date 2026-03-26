import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type SearchEmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
};

export function SearchEmptyState({
  icon,
  title,
  description,
  color,
}: SearchEmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={48} color={color} style={{ marginBottom: 12 }} />
      <Text size="lg" mode="subtle" weight="semibold">
        {title}
      </Text>
      <Text size="md" mode="subtle" style={styles.description}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  description: {
    marginTop: 4,
    textAlign: "center",
  },
}));
