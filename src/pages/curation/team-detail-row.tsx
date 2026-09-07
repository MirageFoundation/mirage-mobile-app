import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";

export function TeamDetailRow({ title, description, icon, danger, disabled, onPress }: {
  title: string; description?: string; icon: React.ComponentProps<typeof Ionicons>["name"];
  danger?: boolean; disabled?: boolean; onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const color = danger ? theme.colors.error[500] : theme.colors.text.default;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}
    >
      <Ionicons name={icon} size={21} color={color} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text size="md" weight="medium" style={{ color }}>{title}</Text>
        {description ? <Text size="sm" mode="subtle">{description}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.text.subtle} />
    </Pressable>
  );
}
