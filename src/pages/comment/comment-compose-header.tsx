import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./comment-compose-styles";

type CommentComposeHeaderProps = {
  canSubmit: boolean;
  isEditMode: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export function CommentComposeHeader({
  canSubmit,
  isEditMode,
  onClose,
  onSubmit,
}: CommentComposeHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close comment composer"
        onPress={onClose}
        style={styles.headerButton}
        hitSlop={8}
      >
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
