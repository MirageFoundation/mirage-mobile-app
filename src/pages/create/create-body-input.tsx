import type { MutableRefObject, RefObject } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { useDraftStore } from "@/src/stores/draft-store";

import { styles } from "./create-screen-styles";

type CreateBodyInputProps = {
  inputRef: RefObject<TextInput | null>;
  maxLength: number;
  editExpired: boolean;
  selection: TextInputProps["selection"];
  bodySelectionRef: MutableRefObject<{ start: number; end: number }>;
  detectMention: (text: string, cursorPosition: number) => void;
};

export function CreateBodyInput({
  inputRef,
  maxLength,
  editExpired,
  selection,
  bodySelectionRef,
  detectMention,
}: CreateBodyInputProps) {
  const { theme } = useUnistyles();
  const value = useDraftStore((state) => state.draft.body);
  const updateDraft = useDraftStore((state) => state.updateDraft);

  const handleChangeText = (text: string) => {
    updateDraft({ body: text });
    setTimeout(() => {
      detectMention(text, bodySelectionRef.current.start);
    }, 0);
  };

  return (
    <>
      <TextInput
        ref={inputRef}
        style={[
          styles.bodyInput,
          { color: theme.colors.text.default },
          editExpired && { opacity: 0.5 },
        ]}
        placeholder="body text (optional)"
        placeholderTextColor={theme.colors.text.subtle}
        value={value}
        onChangeText={handleChangeText}
        multiline
        maxLength={maxLength}
        textAlignVertical="top"
        selection={selection}
        onSelectionChange={(event) => {
          bodySelectionRef.current = event.nativeEvent.selection;
        }}
        editable={!editExpired}
      />
      {value.length > 0 && (
        <Text
          size="xs"
          style={{
            color: value.length >= maxLength
              ? theme.colors.error[500]
              : theme.colors.text.subtle,
            textAlign: "right",
            marginTop: -8,
          }}
        >
          {value.length}/{maxLength}
        </Text>
      )}
    </>
  );
}
