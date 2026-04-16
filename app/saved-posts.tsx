import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { SavedPostsScreen } from "@/src/pages";
import { Text } from "@/src/components/ui/primitives";
import { useRouter } from "@/src/hooks/use-router";

function SavedPostsErrorFallback({ resetError }: { resetError: () => void }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleBack = useCallback(() => {
    resetError();
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [resetError, router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background.default }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top,
          paddingHorizontal: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="bold">
          Saved
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: theme.spacing.xl,
        }}
      >
        <Text size="lg" weight="bold" style={{ textAlign: "center", marginBottom: 8 }}>
          Something went wrong
        </Text>
        <Text size="md" mode="subtle" style={{ textAlign: "center" }}>
          We couldn't load your saved items. Please try again.
        </Text>
      </View>
    </View>
  );
}

export default function SavedPostsRoute() {
  return (
    <Sentry.ErrorBoundary
      fallback={(errorData) => (
        <SavedPostsErrorFallback resetError={errorData.resetError} />
      )}
      beforeCapture={(scope) => {
        scope.setTag("feature", "saved-posts");
        scope.setTag("boundary", "saved-posts-route");
      }}
    >
      <SavedPostsScreen />
    </Sentry.ErrorBoundary>
  );
}
