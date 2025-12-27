import { Box, Text } from "@/src/components/ui/primitives";

export default function FollowingScreen() {
  return (
    <Box flex background="base" safeAreaTop>
      <Box p="md">
        <Text size="xl" weight="bold">
          Following
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Posts from people you follow will appear here
        </Text>
      </Box>
    </Box>
  );
}

