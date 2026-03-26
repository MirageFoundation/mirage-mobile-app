import { EvilIcons } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

import { Box, Button } from "@/src/components/ui/primitives";

type CreateScreenHeaderProps = {
  canSubmit: boolean;
  isSubmitting: boolean;
  isEditMode: boolean;
  submitLabel: string;
  closeIconColor: string;
  submitTextColor: string;
  submitBackgroundColor: string;
  onClose: () => void;
  onSubmit: () => void;
};

export function CreateScreenHeader({
  canSubmit,
  isSubmitting,
  isEditMode,
  submitLabel,
  closeIconColor,
  submitTextColor,
  submitBackgroundColor,
  onClose,
  onSubmit,
}: CreateScreenHeaderProps) {
  return (
    <Box style={styles.header}>
      <Button
        variant="ghost"
        size="auto"
        onPress={onClose}
        style={styles.headerButton}
      >
        <Button.Icon>
          <EvilIcons name="close" size={36} color={closeIconColor} />
        </Button.Icon>
      </Button>

      <Box flex />

      <Button
        variant="outline"
        size="sm"
        onPress={onSubmit}
        disabled={!canSubmit || isSubmitting}
        style={[
          styles.postButton,
          (!canSubmit || isSubmitting) && styles.postButtonDisabled,
          { backgroundColor: submitBackgroundColor },
        ]}
      >
        <Button.Text style={[styles.postButtonText, { color: submitTextColor }]}>
          {isEditMode ? "Save" : submitLabel}
        </Button.Text>
      </Button>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
  },
  postButton: {
    paddingHorizontal: theme.spacing.md + 4,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
}));
