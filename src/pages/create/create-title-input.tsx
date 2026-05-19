import type { RefObject } from "react";
import { TextInput } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { useDraftStore } from "@/src/stores/draft-store";

import { styles } from "./create-screen-styles";

type CreateTitleInputProps = {
  inputRef: RefObject<TextInput | null>;
  bodyInputRef: RefObject<TextInput | null>;
  maxLength: number;
  editExpired: boolean;
};

export function CreateTitleInput({
  inputRef,
  bodyInputRef,
  maxLength,
  editExpired,
}: CreateTitleInputProps) {
  const { theme } = useUnistyles();
  const value = useDraftStore((state) => state.draft.title);
  const updateDraft = useDraftStore((state) => state.updateDraft);

  return (
    <>
      <TextInput
        ref={inputRef}
        style={[
          styles.titleInput,
          { color: theme.colors.text.default },
          editExpired && { opacity: 0.5 },
        ]}
        placeholder="Title"
        placeholderTextColor={theme.colors.text.subtle}
        value={value}
        onChangeText={(text) => updateDraft({ title: text })}
        multiline
        maxLength={maxLength}
        returnKeyType="next"
        onSubmitEditing={() => bodyInputRef.current?.focus()}
        blurOnSubmit={false}
        editable={!editExpired}
      />
      <Text
        size="xs"
        style={{
          color: value.length >= maxLength
            ? theme.colors.error[500]
            : theme.colors.text.subtle,
          textAlign: "right",
          marginTop: -8,
          marginBottom: 4,
        }}
      >
        {value.length}/{maxLength}
      </Text>
    </>
  );
}
