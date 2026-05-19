import { Feather } from "@expo/vector-icons";
import { useEffect, type RefObject } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useDraftStore } from "@/src/stores/draft-store";

import { useCreateComposeState } from "./create-compose-state";
import { styles } from "./create-screen-styles";

type CreateLinkInputProps = {
  linkInputRef: RefObject<TextInput | null>;
  linkUrlInputRef: RefObject<TextInput | null>;
};

export function CreateLinkInput({
  linkInputRef,
  linkUrlInputRef,
}: CreateLinkInputProps) {
  const { theme } = useUnistyles();
  const updateDraft = useDraftStore((state) => state.updateDraft);
  const visible = useCreateComposeState((state) => state.showLinkInput);
  const linkName = useCreateComposeState((state) => state.linkName);
  const linkUrl = useCreateComposeState((state) => state.linkUrl);
  const linkError = useCreateComposeState((state) => state.linkError);
  const setLinkName = useCreateComposeState((state) => state.setLinkName);
  const setLinkUrl = useCreateComposeState((state) => state.setLinkUrl);
  const resetLinkInput = useCreateComposeState((state) => state.resetLinkInput);
  const canAddLink = linkName.trim().length > 0 && linkUrl.trim().length > 0 && !linkError;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => linkInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [linkInputRef, visible]);

  const handleAddLink = () => {
    if (!canAddLink) return;
    triggerHaptic("medium");
    const trimmedUrl = linkUrl.trim();
    const trimmedName = linkName.trim();
    const markdownLink = `[${trimmedName}](${trimmedUrl})`;
    const currentBody = useDraftStore.getState().draft.body;
    const newBody = currentBody.trim()
      ? `${currentBody}\n\n${markdownLink}`
      : markdownLink;
    updateDraft({ body: newBody });
    resetLinkInput();
  };

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.linkInputContainer}
    >
      <TextInput
        ref={linkInputRef}
        style={[
          styles.linkInput,
          styles.linkNameInput,
          { color: theme.colors.text.default },
        ]}
        placeholder="Link name"
        placeholderTextColor={theme.colors.text.subtle}
        value={linkName}
        onChangeText={setLinkName}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => linkUrlInputRef.current?.focus()}
        blurOnSubmit={false}
      />
      <TextInput
        ref={linkUrlInputRef}
        style={[
          styles.linkInput,
          { color: theme.colors.text.default },
        ]}
        placeholder="https://"
        placeholderTextColor={theme.colors.text.subtle}
        value={linkUrl}
        onChangeText={setLinkUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {linkError && (
        <View
          style={[
            styles.linkErrorContainer,
            { borderColor: theme.colors.border.default },
          ]}
        >
          <Feather
            name="alert-circle"
            size={14}
            color={theme.colors.error[500]}
          />
          <Text
            size="xs"
            style={{ color: theme.colors.error[500], marginLeft: 4 }}
          >
            {linkError}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
        <Pressable
          onPress={handleAddLink}
          disabled={!canAddLink}
          style={[
            styles.addLinkButton,
            {
              backgroundColor: canAddLink
                ? theme.colors.brand[500]
                : theme.colors.background.subtle,
            },
          ]}
        >
          <Text
            size="md"
            weight="semibold"
            style={{
              color: canAddLink ? "#FFFFFF" : theme.colors.text.subtle,
            }}
          >
            Add link
          </Text>
        </Pressable>
        <Pressable
          onPress={resetLinkInput}
          style={[
            styles.addLinkButton,
            { backgroundColor: theme.colors.background.subtle },
          ]}
        >
          <Text size="md" weight="semibold" style={{ color: theme.colors.text.subtle }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
