import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Modal, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type ConfirmationPopupProps = {
  /** Whether the popup is visible */
  visible: boolean;
  /** Title text */
  title: string;
  /** Main message text */
  message: string;
  /** Optional description text below message */
  description?: string;
  /** Icon name from Ionicons */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Custom icon color (defaults to error color for destructive, primary otherwise) */
  iconColor?: string;
  /** Text for confirm button */
  confirmText?: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Whether this is a destructive action (red styling) */
  isDestructive?: boolean;
  /** Loading state for confirm button */
  isLoading?: boolean;
  /** Callback when confirm is pressed */
  onConfirm: () => void;
  /** Callback when cancel is pressed or backdrop is tapped */
  onCancel: () => void;
};

export function ConfirmationPopup({
  visible,
  title,
  message,
  description,
  icon = "alert-circle-outline",
  iconColor,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationPopupProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const defaultIconColor = isDestructive
    ? theme.colors.error[500]
    : theme.colors.primary[500];
  const resolvedIconColor = iconColor ?? defaultIconColor;

  const iconBackgroundColor = isDestructive
    ? "rgba(255, 59, 48, 0.15)"
    : "rgba(59, 130, 246, 0.15)";

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
        <Pressable style={styles.backdrop} onPress={handleCancel} />

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
              { backgroundColor: iconBackgroundColor },
            ]}
          >
            <Ionicons name={icon} size={32} color={resolvedIconColor} />
          </Box>

          {/* Title */}
          <Text size="lg" weight="bold" style={styles.title}>
            {title}
          </Text>

          {/* Message */}
          <Text
            size="md"
            mode="subtle"
            weight="regular"
            style={styles.message}
          >
            {message}
          </Text>

          {/* Description (optional) */}
          {description && (
            <Text size="md" mode="subtle" style={styles.description}>
              {description}
            </Text>
          )}

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
              <Button.Text>{cancelText}</Button.Text>
            </Button>

            <Button
              size="lg"
              mode={isDestructive ? "error" : "brand"}
              rounded="full"
              onPress={handleConfirm}
              loading={isLoading}
              style={[
                styles.button,
                isDestructive && {
                  backgroundColor: theme.colors.error[500],
                },
              ]}
            >
              <Button.Text>{confirmText}</Button.Text>
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
  message: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  description: {
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  buttons: {
    width: "100%",
    marginTop: theme.spacing.md,
  },
  button: {
    width: "100%",
  },
}));
