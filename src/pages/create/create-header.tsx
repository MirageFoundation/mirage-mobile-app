import { EvilIcons } from "@expo/vector-icons";
import { useUnistyles } from "react-native-unistyles";

import { Box, Button } from "@/src/components/ui/primitives";

import { styles } from "./create-screen-styles";

type CreateHeaderProps = {
  canPost: boolean;
  isSubmitting: boolean;
  isEditMode: boolean;
  onClose: () => void;
  onPost: () => void;
};

export function CreateHeader({
  canPost,
  isSubmitting,
  isEditMode,
  onClose,
  onPost,
}: CreateHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <Box style={styles.header}>
      <Button
        variant="ghost"
        size="auto"
        onPress={onClose}
        style={styles.headerButton}
      >
        <Button.Icon>
          <EvilIcons
            name="close"
            size={36}
            color={theme.colors.text.default}
          />
        </Button.Icon>
      </Button>

      <Box flex />

      <Button
        variant="outline"
        size="sm"
        onPress={onPost}
        disabled={!canPost || isSubmitting}
        style={[
          styles.postButton,
          (!canPost || isSubmitting) && styles.postButtonDisabled,
          {
            backgroundColor:
              canPost && !isSubmitting
                ? theme.colors.brand[500]
                : theme.colors.background.subtle,
          },
        ]}
      >
        <Button.Text
          style={[
            styles.postButtonText,
            {
              color:
                canPost && !isSubmitting
                  ? "#FFFFFF"
                  : theme.colors.text.subtle,
            },
          ]}
        >
          {isEditMode ? "Save" : "Post"}
        </Button.Text>
      </Button>
    </Box>
  );
}
