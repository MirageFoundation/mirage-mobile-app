import { Box, Text } from "@/src/components/ui/primitives";

export default function UsernameScreen() {
  return (
    <Box flex background="base" safeAreaTop>
      <Box p="md">
        <Text size="xl" weight="bold">
          Choose Username
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          This will be your identity on Mirage
        </Text>
      </Box>
    </Box>
  );
}

