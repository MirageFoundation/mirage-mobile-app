import type { RefObject } from "react";
import { Pressable, TextInput } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type CommentComposeLinkEditorProps = {
  visible: boolean;
  linkName: string;
  linkUrl: string;
  canAddLink: boolean;
  linkUrlRef: RefObject<TextInput | null>;
  onChangeLinkName: (value: string) => void;
  onChangeLinkUrl: (value: string) => void;
  onSubmit: () => void;
};

export function CommentComposeLinkEditor({
  visible,
  linkName,
  linkUrl,
  canAddLink,
  linkUrlRef,
  onChangeLinkName,
  onChangeLinkUrl,
  onSubmit,
}: CommentComposeLinkEditorProps) {
  const { theme } = useUnistyles();

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.linkContainer}
    >
      <TextInput
        style={[
          styles.linkInput,
          styles.linkNameInput,
          { color: theme.colors.text.default },
        ]}
        placeholder="Link name"
        placeholderTextColor={theme.colors.text.subtle}
        value={linkName}
        onChangeText={onChangeLinkName}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => linkUrlRef.current?.focus()}
        blurOnSubmit={false}
      />
      <TextInput
        ref={linkUrlRef}
        style={[styles.linkInput, { color: theme.colors.text.default }]}
        placeholder="https://"
        placeholderTextColor={theme.colors.text.subtle}
        value={linkUrl}
        onChangeText={onChangeLinkUrl}
        keyboardType="url"
        autoCapitalize="none"
      />
      <Pressable
        onPress={onSubmit}
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
            fontSize: 16,
          }}
        >
          Add link
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  linkContainer: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  linkInput: {
    fontSize: 18,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  linkNameInput: {
    fontSize: 20,
    fontWeight: "600",
  },
  addLinkButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radius.full,
    marginTop: theme.spacing.xs,
  },
}));
