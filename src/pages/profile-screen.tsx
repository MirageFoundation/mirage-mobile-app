import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Text } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <Box p="md">
        <Text size="xl" weight="bold">
          Profile
        </Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
          Welcome, @{user?.username || "user"}
        </Text>
      </Box>
    </Box>
  );
}
