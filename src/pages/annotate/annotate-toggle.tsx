import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { Text } from "@/src/components/ui/primitives";

export function AnnotateToggle({
  children,
  enabled,
  label,
  onToggle,
  subtleColor,
}: {
  children: React.ReactNode;
  enabled: boolean;
  label: string;
  onToggle: () => void;
  subtleColor: string;
}) {
  return (
    <View style={styles.section}>
      <Pressable onPress={onToggle} style={styles.fieldToggle}>
        <Ionicons
          name={enabled ? "checkbox" : "square-outline"}
          size={20}
          color={enabled ? "#EF4444" : subtleColor}
        />
        <Text size="md" weight="semibold" style={styles.fieldLabel}>
          Override {label}
        </Text>
      </Pressable>
      {enabled ? children : null}
    </View>
  );
}

const styles = {
  section: {
    marginBottom: 24,
  },
  fieldToggle: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 8,
    gap: 10,
  },
  fieldLabel: {
    flex: 1,
  },
};
