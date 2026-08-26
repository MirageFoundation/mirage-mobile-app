import { Feather, Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./comment-compose-styles";
import { extractMarkdownLinks } from "./comment-compose-utils";

type CommentComposeLinkSectionProps = {
  canAddLink: boolean;
  linkError: string | null;
  linkName: string;
  linkUrl: string;
  linkUrlRef: RefObject<TextInput | null>;
  text: string;
  onAddLink: () => void;
  onCancel: () => void;
  onChangeLinkName: (value: string) => void;
  onChangeLinkUrl: (value: string) => void;
  onRemoveLink: (markdown: string) => void;
};

export function CommentComposeLinkSection({
  canAddLink,
  linkError,
  linkName,
  linkUrl,
  linkUrlRef,
  text,
  onAddLink,
  onCancel,
  onChangeLinkName,
  onChangeLinkUrl,
  onRemoveLink,
}: CommentComposeLinkSectionProps) {
  const { theme } = useUnistyles();
  const links = extractMarkdownLinks(text);

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
      {linkError && (
        <View style={styles.linkErrorContainer}>
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
          onPress={onAddLink}
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
        <Pressable
          onPress={onCancel}
          style={[
            styles.addLinkButton,
            { backgroundColor: theme.colors.background.subtle },
          ]}
        >
          <Text
            size="md"
            weight="semibold"
            style={{ color: theme.colors.text.subtle, fontSize: 16 }}
          >
            Cancel
          </Text>
        </Pressable>
      </View>
      {links.length > 0 && (
        <View style={styles.addedLinksContainer}>
          <Text size="md" weight="semibold">Added links:</Text>
          {links.map((link, i) => {
            const markdown = `[${link.name}](${link.url})`;
            return (
              <View key={i} style={styles.addedLinkRow}>
                <Feather
                  name="link"
                  size={16}
                  color={theme.colors.text.subtle}
                  style={{ marginTop: 4 }}
                />
                <View style={{ flex: 1 }}>
                  <Text size="md" style={{ color: "#3B82F6" }}>
                    {link.name}
                  </Text>
                  <Text size="md" mode="subtle">
                    {link.url.split("").join("\u200B")}
                  </Text>
                </View>
                <Pressable onPress={() => onRemoveLink(markdown)} hitSlop={8}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={theme.colors.error[500]}
                    style={{ marginTop: 4 }}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}
