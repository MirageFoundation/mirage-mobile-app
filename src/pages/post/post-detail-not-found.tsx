import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

import { Box, Text } from "@/src/components/ui/primitives";

type PostDetailTheme = {
  colors: {
    background: { subtle: string };
    border: { default: string };
    text: { subtle: string };
  };
};

type PostDetailNotFoundProps = {
  header: React.ReactNode;
  message?: string;
  onBack: () => void;
  theme: PostDetailTheme;
};

export function PostDetailNotFound({ header, message, onBack, theme }: PostDetailNotFoundProps) {
  return (
    <Box flex background="base">
      {header}
      <Box flex center p="lg">
        <Ionicons
          name="trash-outline"
          size={48}
          color={theme.colors.text.subtle}
        />
        <Text
          size="lg"
          weight="semibold"
          mode="subtle"
          style={{ marginTop: 12 }}
        >
          {message ?? "Post not found."}
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 4, textAlign: "center" }}
        >
          This post may have been deleted or does not exist.
        </Text>
        <Pressable
          onPress={onBack}
          style={{
            marginTop: 20,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: theme.colors.border.default,
            borderRadius: 8,
            backgroundColor: theme.colors.background.subtle,
          }}
        >
          <Text size="sm" weight="medium">
            Go back
          </Text>
        </Pressable>
      </Box>
    </Box>
  );
}
