import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";

type MediaPostDetailNotFoundProps = {
  message?: string;
  onBack: () => void;
};

export function MediaPostDetailNotFound({ message, onBack }: MediaPostDetailNotFoundProps) {
  const { theme } = useUnistyles();

  return (
    <Box flex center background="base" p="lg">
      <Ionicons
        name="trash-outline"
        size={48}
        color={theme.colors.text.subtle}
      />
      <Text size="lg" weight="semibold" mode="subtle" style={{ marginTop: 12 }}>
        {message ?? "Post unavailable"}
      </Text>
      <Text size="md" mode="subtle" style={{ marginTop: 4, textAlign: "center" }}>
        This post may have been deleted or does not exist.
      </Text>
      <Pressable onPress={onBack} style={{ marginTop: 16 }}>
        <Text size="sm" weight="medium">
          Go back
        </Text>
      </Pressable>
    </Box>
  );
}
