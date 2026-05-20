import { TextInput } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { styles } from "./annotate-styles";
import { AnnotateToggle } from "./annotate-toggle";

type AnnotateTextOverrideSectionProps = {
  enabled: boolean;
  label: string;
  multiline?: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onToggle: () => void;
};

export function AnnotateTextOverrideSection({
  enabled,
  label,
  multiline = false,
  placeholder,
  value,
  onChange,
  onToggle,
}: AnnotateTextOverrideSectionProps) {
  const { theme } = useUnistyles();

  return (
    <AnnotateToggle
      label={label}
      enabled={enabled}
      onToggle={onToggle}
      theme={theme}
    >
      <TextInput
        style={[
          styles.textInput,
          multiline && styles.multilineInput,
          {
            backgroundColor: theme.colors.background.light,
            borderColor: theme.colors.border.default,
            color: theme.colors.text.default,
          },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.subtle}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : undefined}
      />
    </AnnotateToggle>
  );
}
