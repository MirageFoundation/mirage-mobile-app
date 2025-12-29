import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Text } from "@/src/components/ui/primitives";

export function InboxScreen() {
  const insets = useSafeAreaInsets();

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <Box p="md">
        <Text size="xl" weight="bold">
          Inbox
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Your notifications will appear here
        </Text>
      </Box>
    </Box>
  );
}
