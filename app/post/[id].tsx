import { Box, Text } from "@/src/components/ui/primitives";
import { useLocalSearchParams } from "expo-router";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();

  return (
    <Box flex background="base" safeAreaTop>
      <Box p="md">
        <Text size="xl" weight="bold">
          Post Detail
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Post ID: {id}
        </Text>
      </Box>
    </Box>
  );
}

