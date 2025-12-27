import { Box, Text } from "@/src/components/ui/primitives";

export default function LoginScreen() {
  return (
    <Box flex background="base" safeAreaTop>
      <Box p="md">
        <Text size="xl" weight="bold">
          Login
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Enter your recovery phrase to log in
        </Text>
      </Box>
    </Box>
  );
}

