import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Modal, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type DraftDiscardPopupProps = {
  visible: boolean;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export function DraftDiscardPopup({
  visible,
  onSaveDraft,
  onDiscard,
  onCancel,
}: DraftDiscardPopupProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const handleSaveDraft = () => {
    triggerHaptic("medium");
    onSaveDraft();
  };

  const handleDiscard = () => {
    triggerHaptic("medium");
    onDiscard();
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
          <Box
            style={[
              styles.iconContainer,
              { backgroundColor: theme.colors.brand[500] + "20" },
            ]}
          >
            <Ionicons
              name="document-text-outline"
              size={32}
              color={theme.colors.brand[500]}
            />
          </Box>

          <Text size="xxl" weight="bold" style={styles.title}>
            Save Draft?
          </Text>

          <Text
            size="lg"
            mode="subtle"
            weight="semibold"
            style={styles.description}
          >
            You have unsaved changes.
          </Text>
          <Text size="md" mode="subtle" style={styles.warning}>
            Would you like to save your draft or discard it?
          </Text>

          <Box gap="sm" style={styles.buttons}>
            <Button
              size="lg"
              variant="outline"
              rounded="full"
              onPress={handleDiscard}
              style={styles.button}
            >
              <Button.Text style={{ color: theme.colors.error[500] }}>Discard</Button.Text>
            </Button>

            <Button
              size="lg"
              rounded="full"
              onPress={handleSaveDraft}
              style={[styles.button, { backgroundColor: theme.colors.brand[500] }]}
            >
              <Button.Text style={{ color: "#FFFFFF" }}>Save Draft</Button.Text>
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
}));
