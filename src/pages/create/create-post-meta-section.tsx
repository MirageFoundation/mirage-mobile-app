import type { RefObject } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Entypo, Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import type { Community } from "@/src/stores/draft-store";
import type { ContentTag } from "@/src/api/write/endpoints/posts";

type CreatePostMetaSectionProps = {
  selectedCommunity: Community | null;
  title: string;
  maxTitleLength: number;
  selectedContentWarning: ContentTag;
  editExpired: boolean;
  titleInputRef: RefObject<TextInput | null>;
  bodyInputRef: RefObject<TextInput | null>;
  textColor: string;
  subtleTextColor: string;
  lighterBackgroundColor: string;
  warningColor: string;
  errorColor: string;
  onOpenCommunityModal: () => void;
  onChangeTitle: (text: string) => void;
  onOpenContentWarning: () => void;
  onClearContentWarning: () => void;
};

export function CreatePostMetaSection({
  selectedCommunity,
  title,
  maxTitleLength,
  selectedContentWarning,
  editExpired,
  titleInputRef,
  bodyInputRef,
  textColor,
  subtleTextColor,
  lighterBackgroundColor,
  warningColor,
  errorColor,
  onOpenCommunityModal,
  onChangeTitle,
  onOpenContentWarning,
  onClearContentWarning,
}: CreatePostMetaSectionProps) {
  return (
    <>
      <Pressable
        onPress={onOpenCommunityModal}
        style={[styles.communitySelector, { backgroundColor: lighterBackgroundColor }]}
      >
        {selectedCommunity?.name ? (
          <Text size="lg" weight="semibold" style={{ color: textColor }}>
            #
          </Text>
        ) : null}
        <Text size="lg" weight="semibold" style={{ color: textColor }}>
          {selectedCommunity?.name?.toLowerCase() ?? "Select a topic"}
        </Text>
        <Box style={{ marginLeft: 5 }}>
          <Entypo
            name="chevron-up"
            size={12}
            color={textColor}
            style={{ marginBottom: -5 }}
          />
          <Entypo name="chevron-down" size={12} color={textColor} />
        </Box>
      </Pressable>

      {selectedCommunity?.isNewTopic ? (
        <View
          style={[styles.newTopicWarning, { backgroundColor: `${warningColor}15` }]}
        >
          <Text size="xs" style={{ lineHeight: 16, color: warningColor }}>
            Topics are communities centered around specific interests. Posting in the wrong topic may affect your overall trust status on Mirage. Make sure to post into the right category!
          </Text>
        </View>
      ) : null}

      <TextInput
        ref={titleInputRef}
        style={[styles.titleInput, { color: textColor }, editExpired && { opacity: 0.5 }]}
        placeholder="Title"
        placeholderTextColor={subtleTextColor}
        value={title}
        onChangeText={onChangeTitle}
        multiline
        maxLength={maxTitleLength}
        returnKeyType="next"
        onSubmitEditing={() => bodyInputRef.current?.focus()}
        blurOnSubmit={false}
        editable={!editExpired}
      />
      <Text
        size="xs"
        style={{
          color: title.length >= maxTitleLength ? errorColor : subtleTextColor,
          textAlign: "right",
          marginTop: -8,
          marginBottom: 4,
        }}
      >
        {title.length}/{maxTitleLength}
      </Text>

      <Pressable
        onPress={onOpenContentWarning}
        style={[styles.tagsButton, { backgroundColor: lighterBackgroundColor }]}
      >
        {selectedContentWarning ? (
          <View style={styles.contentWarningSelected}>
            <Text size="md" weight="bold" style={{ color: warningColor }}>
              ⚠️ {selectedContentWarning.charAt(0).toUpperCase() + selectedContentWarning.slice(1)}
            </Text>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onClearContentWarning();
              }}
              hitSlop={8}
            >
              <Feather name="x" size={14} color={subtleTextColor} />
            </Pressable>
          </View>
        ) : (
          <Text size="md" weight="semibold" style={{ color: textColor }}>
            Add content warning (optional)
          </Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  communitySelector: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    gap: 0,
    borderRadius: theme.radius.full,
  },
  newTopicWarning: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.sm,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: theme.typography.family.mono,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.md,
    minHeight: 50,
  },
  tagsButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md + 2,
    borderRadius: theme.radius.full,
  },
  contentWarningSelected: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
}));
