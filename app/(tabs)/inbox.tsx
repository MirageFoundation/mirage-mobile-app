import { Box, Text } from "@/src/components/ui/primitives";

export default function InboxScreen() {
  return (
    <Box flex background="base" safeAreaTop>
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
