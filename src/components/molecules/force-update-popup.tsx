import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import { BlurView } from "expo-blur";
import { useCallback, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import * as Sentry from "@sentry/react-native";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { type ForceUpdateReason } from "@/src/hooks/use-force-update";

const APP_STORE_URL = "https://apps.apple.com/app/id6757619038";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=talk.mirage.mobile";

type ForceUpdatePopupProps = {
  reason: ForceUpdateReason;
  remoteVersion: string | null;
  isRequired: boolean;
};

export function ForceUpdatePopup({ reason, remoteVersion, isRequired }: ForceUpdatePopupProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const [dismissed, setDismissed] = useState(false);

  const handlePress = useCallback(() => {
    triggerHaptic("medium");
    const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
    Linking.openURL(url).catch((err) => {
      Sentry.captureException(err, {
        tags: { feature: "force-update", operation: "open-store" },
        extra: { url },
      });
    });
  }, []);

  if (!reason || dismissed) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />

        <View
          style={[
            styles.popup,
            {
              backgroundColor: isDark
                ? "rgba(30, 30, 30, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
            },
          ]}
        >
          <Box
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(59, 130, 246, 0.15)" },
            ]}
          >
            <Ionicons
              name="storefront-outline"
              size={32}
              color={theme.colors.primary[500]}
            />
          </Box>

          <Text size="lg" weight="bold" style={styles.title}>
            {isRequired ? "Update Required" : "Update Available"}
          </Text>

          <Text size="md" mode="subtle" weight="semibold" style={styles.message}>
            {`Please update the app to v(${remoteVersion ?? "latest"}) to keep Mirage running smoothly and avoid any issues.`}
          </Text>

          <Box gap="sm" style={styles.buttons}>
            <Button
              size="lg"
              mode="brand"
              rounded="full"
              onPress={handlePress}
              style={styles.button}
            >
              <Button.Text>Update Now</Button.Text>
            </Button>

            {!isRequired && (
              <Button
                size="lg"
                variant="ghost"
                rounded="full"
                onPress={() => setDismissed(true)}
                style={styles.button}
              >
                <Button.Text>Maybe Later</Button.Text>
              </Button>
            )}
          </Box>

          {Application.nativeApplicationVersion !== null && (
            <Text size="xs" mode="subtle" style={styles.versionText}>
              Current version: v({Application.nativeApplicationVersion})
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  popup: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  message: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  buttons: {
    width: "100%",
    marginTop: theme.spacing.md,
  },
  button: {
    width: "100%",
  },
  versionText: {
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
}));
