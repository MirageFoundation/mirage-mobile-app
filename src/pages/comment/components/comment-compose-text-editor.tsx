import { Text } from "@/src/components/ui/primitives";
import { TextInput } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

interface CommentComposeTextEditorProps {
  editExpired: boolean;
  effectiveMaxLength: number;
  inputRef: React.RefObject<TextInput | null>;
  selection: { start: number; end: number } | undefined;
  text: string;
  onChangeText: (text: string) => void;
  onSelectionChange: (selection: { start: number; end: number }) => void;
}

export function CommentComposeTextEditor({
  editExpired,
  effectiveMaxLength,
  inputRef,
  selection,
  text,
  onChangeText,
  onSelectionChange,
}: CommentComposeTextEditorProps) {
  const { theme } = useUnistyles();

  return (
    <>
      <TextInput
        ref={inputRef}
        style={[
          styles.textInput,
          { color: theme.colors.text.default },
          editExpired && { opacity: 0.5 },
        ]}
        placeholder="Comment"
        placeholderTextColor={theme.colors.text.subtle}
        value={text}
        onChangeText={onChangeText}
        multiline
        maxLength={effectiveMaxLength}
        autoFocus={!editExpired}
        editable={!editExpired}
        selection={selection}
        onSelectionChange={(event) => {
          onSelectionChange(event.nativeEvent.selection);
        }}
      />
      {text.length > 0 ? (
        <Text size="xs" style={styles.counter(theme, text.length >= effectiveMaxLength)}>
          {text.length}/{effectiveMaxLength}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: "top",
    paddingVertical: theme.spacing.xs,
  },
  counter: (currentTheme: typeof theme, isAtLimit: boolean) => ({
    color: isAtLimit
      ? currentTheme.colors.error[500]
      : currentTheme.colors.text.subtle,
    textAlign: "right",
    marginTop: -8,
  }),
}));
