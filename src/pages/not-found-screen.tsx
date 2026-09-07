import { useCallback } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { useRouter } from "@/src/navigation/guarded-router";

export function NotFoundScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const handleGoHome = useCallback(() => {
    router.replace("/");
  }, [router]);

  return (
    <Box
      flex
      background="base"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View style={styles.content}>
        <Text size="xxl" weight="bold" style={{ textAlign: "center" }}>
          Page not found
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{
            marginTop: theme.spacing.sm,
            textAlign: "center",
            maxWidth: 280,
          }}
        >
          This link is no longer available in the app.
        </Text>
        <Button
          size="lg"
          rounded="full"
          onPress={handleGoHome}
          style={{ marginTop: theme.spacing.lg }}
        >
          <Button.Text weight="medium">Go home</Button.Text>
        </Button>
      </View>
    </Box>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
});
