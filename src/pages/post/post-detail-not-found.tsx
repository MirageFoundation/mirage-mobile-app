import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";

type PostDetailNotFoundProps = {
  header: React.ReactNode;
  message?: string;
  onBack: () => void;
};

export function PostDetailNotFound({ header, message, onBack }: PostDetailNotFoundProps) {
  const { theme } = useUnistyles();

  return (
    <Box flex background="base">
      <Box
        style={StyleSheet.absoluteFill}
        center
        px="lg"
        gap="lg"
      >
        <Box
          center
          style={{
            width: 88,
            height: 88,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.error[500] + "15",
            borderWidth: 1,
            borderColor: theme.colors.error[500] + "40",
          }}
        >
          <Ionicons
            name="trash-bin-outline"
            size={38}
            color={theme.colors.error[500]}
          />
        </Box>

        <Box center gap="xs">
          <Text size="xl" weight="bold">
            {message ?? "Post not found"}
          </Text>
          <Text
            size="sm"
            mode="subtle"
            leading="relaxed"
            style={{ textAlign: "center", maxWidth: 300 }}
          >
            This post may have been deleted by its author or is no longer
            available.
          </Text>
        </Box>

        <Button
          size="md"
          variant="outline"
          mode="subtle"
          rounded="full"
          onPress={onBack}
          contentStyle={{ paddingHorizontal: theme.spacing.md }}
          mt="sm"
        >
          <Button.Icon>
            {({ color, size }) => (
              <Ionicons name="arrow-back" size={size} color={color} />
            )}
          </Button.Icon>
          <Button.Text weight="semibold">Go back</Button.Text>
        </Button>
      </Box>
      {header}
    </Box>
  );
}
