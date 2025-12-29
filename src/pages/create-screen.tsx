import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Text } from "@/src/components/ui/primitives";

export function CreateScreen() {
  const insets = useSafeAreaInsets();

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <Box p="md">
        <Text size="xl" weight="bold">
          Create Post
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Share something with the world
        </Text>
      </Box>
    </Box>
  );
}
