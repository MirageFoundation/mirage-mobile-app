import { Box, Text } from "@/src/components/ui/primitives";

export default function CreateScreen() {
  return (
    <Box flex background="base" safeAreaTop>
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

