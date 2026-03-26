import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type CommentComposeHeaderProps = {
  isEditMode: boolean;
  canSubmit: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export function CommentComposeHeader({
  isEditMode,
  canSubmit,
  onClose,
  onSubmit,
}: CommentComposeHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.header}>
      <Pressable onPress={onClose} style={styles.headerButton}>
        <Ionicons
          name="close"
          size={28}
          color={theme.colors.text.default}
        />
      </Pressable>
      <Text size="lg" weight="bold" style={styles.headerTitle}>
        {isEditMode ? "Edit comment" : "Add comment"}
      </Text>
      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        style={[
          styles.postButton,
          {
            backgroundColor: canSubmit
              ? theme.colors.brand[500]
              : theme.colors.background.subtle,
          },
        ]}
      >
        <Text
          size="sm"
          weight="bold"
          style={{
            color: canSubmit ? "#FFFFFF" : theme.colors.text.subtle,
          }}
        >
          {isEditMode ? "Save" : "Post"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.sm,
    height: 52,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  postButton: {
    paddingHorizontal: theme.spacing.md + 4,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
  },
}));
