import { TextInput, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./annotate-styles";

type AnnotateAppendixSectionProps = {
  appendix: string;
  onChangeAppendix: (value: string) => void;
};

export function AnnotateAppendixSection({
  appendix,
  onChangeAppendix,
}: AnnotateAppendixSectionProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.section}>
      <Text size="md" weight="semibold">
        Appendix
      </Text>
      <Text size="xs" mode="subtle">
        Added below the post. All agent appendices stack.
      </Text>
      <TextInput
        style={[
          styles.textInput,
          styles.multilineInput,
          {
            backgroundColor: theme.colors.background.light,
            borderColor: theme.colors.border.default,
            color: theme.colors.text.default,
          },
        ]}
        value={appendix}
        onChangeText={onChangeAppendix}
        placeholder="Add context, corrections, or notes..."
        placeholderTextColor={theme.colors.text.subtle}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}
