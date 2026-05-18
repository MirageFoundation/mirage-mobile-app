import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Modal, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type LogoutConfirmationPopupProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
};

export function LogoutConfirmationPopup({
  visible,
  onCancel,
  onConfirm,
  isLoading = false,
}: LogoutConfirmationPopupProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const handleConfirm = () => {
    triggerHaptic("medium");
    onConfirm();
  };

  const handleCancel = () => {
    triggerHaptic("light");
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <Pressable style={styles.backdrop} onPress={onCancel} />

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
          {/* Icon */}
          <Box
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(255, 59, 48, 0.15)" },
            ]}
          >
            <Ionicons
              name="log-out-outline"
              size={32}
              color={theme.colors.error[500]}
            />
          </Box>

          {/* Title */}
          <Text size="xxl" weight="bold" style={styles.title}>
            Log Out
          </Text>

          {/* Description */}
          <Text
            size="lg"
            mode="subtle"
            weight="semibold"
            style={styles.description}
          >
            Are you sure you want to log out?
          </Text>
          <Text size="md" mode="subtle" style={styles.warning}>
            You&apos;ll need your recovery phrase to log back in.
          </Text>

          {/* Buttons */}
          <Box gap="sm" style={styles.buttons}>
            <Button
              size="lg"
              variant="outline"
              rounded="full"
              onPress={handleCancel}
              disabled={isLoading}
              style={styles.button}
            >
              <Button.Text>Cancel</Button.Text>
            </Button>

            <Button
              size="lg"
              mode="error"
              rounded="full"
              onPress={handleConfirm}
              loading={isLoading}
              style={[styles.button, styles.logoutButton]}
            >
              <Button.Text>Log Out</Button.Text>
            </Button>
          </Box>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
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
  description: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  warning: {
    textAlign: "center",
    marginBottom: theme.spacing.xl,
  },
  buttons: {
    width: "100%",
  },
  button: {
    width: "100%",
  },
  logoutButton: {
    backgroundColor: theme.colors.error[500],
  },
}));
