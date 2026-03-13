import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import Constants from "expo-constants";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import * as Updates from "expo-updates";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { type ForceUpdateReason } from "@/src/hooks/use-force-update";

const APP_STORE_URL =
  "https://apps.apple.com/in/app/mirage-talk/id6757619038";
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
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isNative = reason === "native";

  const handlePress = useCallback(async () => {
    triggerHaptic("medium");
    if (isNative) {
      const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
      Linking.openURL(url).catch(() => {});
    } else {
      setInstalling(true);
      try {
        await Updates.fetchUpdateAsync();
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => {
            setTimeout(resolve, 800);
          });
        });
        await Updates.reloadAsync();
      } catch {
        setInstalling(false);
      }
    }
  }, [isNative]);

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
              name={isNative ? "storefront-outline" : "cloud-download-outline"}
              size={32}
              color={theme.colors.primary[500]}
            />
          </Box>

          <Text size="lg" weight="bold" style={styles.title}>
            {isRequired ? "Update Required" : "Update Available"}
          </Text>

          <Text size="md" mode="subtle" weight="semibold" style={styles.message}>
            {isNative
              ? `Please update the app to v(${remoteVersion ?? "latest"}) to keep Mirage running smoothly and avoid any issues.`
              : "A new update is available. Please install it to keep things running smoothly and prevent any issues."}
          </Text>

          <Box gap="sm" style={styles.buttons}>
            <Button
              size="lg"
              mode="brand"
              rounded="full"
              onPress={handlePress}
              loading={installing}
              disabled={installing}
              style={styles.button}
            >
              {installing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Button.Text>
                  {isNative ? "Update Now" : "Install & Restart"}
                </Button.Text>
              )}
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

          <Text size="xs" mode="subtle" style={styles.versionText}>
            Current version: v({Constants.expoConfig?.version ?? "0.0.0"})
          </Text>
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
