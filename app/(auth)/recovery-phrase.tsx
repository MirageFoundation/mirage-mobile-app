import { Box, Text } from "@/src/components/ui/primitives";

export default function RecoveryPhraseScreen() {
  return (
    <Box flex background="base" safeAreaTop>
      <Box p="md">
        <Text size="xl" weight="bold">
          Recovery Phrase
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Save your recovery phrase securely
        </Text>
      </Box>
    </Box>
  );
}

