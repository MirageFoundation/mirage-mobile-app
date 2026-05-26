import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";

type MediaPostDetailNotFoundProps = {
  onBack: () => void;
};

export function MediaPostDetailNotFound({ onBack }: MediaPostDetailNotFoundProps) {
  const { theme } = useUnistyles();

  return (
    <Box flex center background="base" p="lg">
      <Ionicons
        name="alert-circle-outline"
        size={48}
        color={theme.colors.text.subtle}
      />
      <Text size="lg" weight="semibold" mode="subtle" style={{ marginTop: 12 }}>
        Post unavailable
      </Text>
      <Pressable onPress={onBack} style={{ marginTop: 16 }}>
        <Text size="sm" weight="medium">
          Go back
        </Text>
      </Pressable>
    </Box>
  );
}
