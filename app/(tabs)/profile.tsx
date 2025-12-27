import { Box, Text } from "@/src/components/ui/primitives";

export default function ProfileScreen() {
  return (
    <Box flex background="base" safeAreaTop>
      <Box p="md">
        <Text size="xl" weight="bold">
          Profile
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Your profile information will appear here
        </Text>
      </Box>
    </Box>
  );
}

