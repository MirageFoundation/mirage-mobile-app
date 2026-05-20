import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./annotate-styles";

type AnnotateHeaderProps = {
  canSubmit: boolean;
  topInset: number;
  onBack: () => void;
  onSubmit: () => void;
};

export function AnnotateHeader({
  canSubmit,
  topInset,
  onBack,
  onSubmit,
}: AnnotateHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View style={[styles.header, { paddingTop: topInset }]}> 
      <View
        style={[
          styles.headerTitleAbsolute,
          { paddingTop: topInset, paddingBottom: theme.spacing.sm },
        ]}
        pointerEvents="none"
      >
        <Text size="lg" weight="bold">
          Annotate Post
        </Text>
      </View>
      <Pressable onPress={onBack} style={styles.headerButton}>
        <Ionicons
          name="close"
          size={28}
          color={theme.colors.text.default}
        />
      </Pressable>
      <View style={{ flex: 1 }} />
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
          Submit
        </Text>
      </Pressable>
    </View>
  );
}
