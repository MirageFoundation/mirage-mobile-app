import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./annotate-styles";

type AnnotateToggleProps = {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  theme: any;
  children: ReactNode;
};

export function AnnotateToggle({
  label,
  enabled,
  onToggle,
  theme,
  children,
}: AnnotateToggleProps) {
  return (
    <View style={styles.section}>
      <Pressable onPress={onToggle} style={styles.fieldToggle}>
        <Ionicons
          name={enabled ? "checkbox" : "square-outline"}
          size={20}
          color={enabled ? "#EF4444" : theme.colors.text.subtle}
        />
        <Text size="md" weight="semibold" style={styles.fieldLabel}>
          Override {label}
        </Text>
      </Pressable>
      {enabled && children}
    </View>
  );
}
