import { Entypo, Feather } from "@expo/vector-icons";
import { Pressable, TextInput, View } from "react-native";

import { Box, Text } from "@/src/components/ui/primitives";
import type { Community } from "@/src/stores/draft-store";

import { AnnotateToggle } from "./annotate-toggle";

export function AnnotateTitleSection({
  backgroundLight,
  borderColor,
  enabled,
  onChangeText,
  onToggle,
  subtleTextColor,
  text,
  textColor,
}: {
  backgroundLight: string;
  borderColor: string;
  enabled: boolean;
  onChangeText: (value: string) => void;
  onToggle: () => void;
  subtleTextColor: string;
  text: string;
  textColor: string;
}) {
  return (
    <AnnotateToggle label="Title" enabled={enabled} onToggle={onToggle} subtleColor={subtleTextColor}>
      <TextInput
        style={[styles.textInput, { backgroundColor: backgroundLight, borderColor, color: textColor }]}
        value={text}
        onChangeText={onChangeText}
        placeholder="Replacement title..."
        placeholderTextColor={subtleTextColor}
      />
    </AnnotateToggle>
  );
}

export function AnnotateContentSection({
  backgroundLight,
  borderColor,
  enabled,
  onChangeText,
  onToggle,
  subtleTextColor,
  text,
  textColor,
}: {
  backgroundLight: string;
  borderColor: string;
  enabled: boolean;
  onChangeText: (value: string) => void;
  onToggle: () => void;
  subtleTextColor: string;
  text: string;
  textColor: string;
}) {
  return (
    <AnnotateToggle label="Content" enabled={enabled} onToggle={onToggle} subtleColor={subtleTextColor}>
      <TextInput
        style={[styles.textInput, styles.multilineInput, { backgroundColor: backgroundLight, borderColor, color: textColor }]}
        value={text}
        onChangeText={onChangeText}
        placeholder="Replacement content..."
        placeholderTextColor={subtleTextColor}
        multiline
        textAlignVertical="top"
      />
    </AnnotateToggle>
  );
}

export function AnnotateTopicSection({
  backgroundLight,
  enabled,
  isNewTopic,
  onOpenSelector,
  onToggle,
  selectedCommunity,
  subtleTextColor,
  textColor,
}: {
  backgroundLight: string;
  enabled: boolean;
  isNewTopic: boolean;
  onOpenSelector: () => void;
  onToggle: () => void;
  selectedCommunity: Community | null;
  subtleTextColor: string;
  textColor: string;
}) {
  return (
    <>
      <AnnotateToggle label="Topic" enabled={enabled} onToggle={onToggle} subtleColor={subtleTextColor}>
        <Pressable onPress={onOpenSelector} style={[styles.selectorButton, { backgroundColor: backgroundLight }]}> 
          {selectedCommunity ? (
            <Text size="lg" weight="bold" style={{ color: textColor }}>
              #
            </Text>
          ) : null}
          <Text size="md" weight="semibold" style={{ color: textColor }}>
            {selectedCommunity?.name?.toLowerCase() ?? "Select a topic"}
          </Text>
          <Box style={{ marginLeft: 8 }}>
            <Entypo name="chevron-up" size={10} color={textColor} style={{ marginBottom: -4 }} />
            <Entypo name="chevron-down" size={10} color={textColor} />
          </Box>
        </Pressable>
      </AnnotateToggle>

      {enabled && isNewTopic ? (
        <View style={styles.newTopicWarning}>
          <Text size="xs" mode="subtle" style={{ lineHeight: 16 }}>
            Topics are communities centered around specific interests. Posting in the wrong topic may affect your overall trust status on Mirage. Make sure to post into the right category!
          </Text>
        </View>
      ) : null}
    </>
  );
}

export function AnnotateTagSection({
  backgroundLight,
  enabled,
  onClearTag,
  onOpenSelector,
  onToggle,
  selectedTag,
  subtleTextColor,
  textColor,
  warningColor,
}: {
  backgroundLight: string;
  enabled: boolean;
  onClearTag: () => void;
  onOpenSelector: () => void;
  onToggle: () => void;
  selectedTag: string;
  subtleTextColor: string;
  textColor: string;
  warningColor: string;
}) {
  return (
    <AnnotateToggle label="Tag" enabled={enabled} onToggle={onToggle} subtleColor={subtleTextColor}>
      {selectedTag ? (
        <Pressable onPress={onOpenSelector} style={[styles.selectorButton, { backgroundColor: backgroundLight, gap: 8 }]}> 
          <Text size="md" weight="bold" style={{ color: warningColor }}>
            ⚠️ {selectedTag.charAt(0).toUpperCase() + selectedTag.slice(1)}
          </Text>
          <Pressable onPress={onClearTag} hitSlop={8}>
            <Feather name="x" size={14} color={subtleTextColor} />
          </Pressable>
        </Pressable>
      ) : (
        <Pressable onPress={onOpenSelector} style={[styles.selectorButton, { backgroundColor: backgroundLight }]}> 
          <Text size="md" weight="semibold" style={{ color: textColor }}>
            Add content warning
          </Text>
        </Pressable>
      )}
    </AnnotateToggle>
  );
}

const styles = {
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  multilineInput: {
    minHeight: 120,
  },
  selectorButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  newTopicWarning: {
    marginBottom: 16,
  },
};
