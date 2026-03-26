import type { RefObject } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

import { LinkPreviewCard } from "@/src/components/molecules/link-preview-card";
import { Text } from "@/src/components/ui/primitives";

type CreateLinkSectionProps = {
  visible: boolean;
  linkUrl: string;
  linkError: string | null;
  editExpired: boolean;
  linkInputRef: RefObject<TextInput | null>;
  textColor: string;
  subtleTextColor: string;
  subtleBackgroundColor: string;
  borderColor: string;
  errorColor: string;
  onChangeLink: (value: string) => void;
  onRemoveLink: () => void;
};

export function CreateLinkSection({
  visible,
  linkUrl,
  linkError,
  editExpired,
  linkInputRef,
  textColor,
  subtleTextColor,
  subtleBackgroundColor,
  borderColor,
  errorColor,
  onChangeLink,
  onRemoveLink,
}: CreateLinkSectionProps) {
  if (!visible) {
    return null;
  }

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.linkInputContainer}
      >
        <View style={styles.linkInputWrapper}>
          <TextInput
            ref={linkInputRef}
            style={[styles.linkInput, { color: textColor }, editExpired && { opacity: 0.5 }]}
            placeholder="https://"
            placeholderTextColor={subtleTextColor}
            value={linkUrl}
            onChangeText={onChangeLink}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!editExpired}
          />
          <Pressable
            onPress={onRemoveLink}
            disabled={editExpired}
            style={[
              styles.linkClearButton,
              { backgroundColor: subtleBackgroundColor },
              editExpired && { opacity: 0 },
            ]}
          >
            <Feather name="x" size={16} color={subtleTextColor} />
          </Pressable>
        </View>
        {linkError ? (
          <View style={[styles.linkErrorContainer, { borderColor }]}>
            <Feather name="alert-circle" size={14} color={errorColor} />
            <Text size="xs" style={{ color: errorColor, marginLeft: 4 }}>
              {linkError}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      {linkUrl && !linkError ? <LinkPreviewCard url={linkUrl} /> : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  linkInputContainer: {
    paddingTop: theme.spacing.md,
  },
  linkInputWrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  linkInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: theme.typography.family.mono,
    paddingVertical: theme.spacing.sm,
  },
  linkClearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  linkErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
  },
}));
