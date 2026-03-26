import { Image } from "expo-image";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { ExtractedImageContent } from "../comment-compose-utils";

type Editability = {
  allowed: boolean;
  remainingMinutes: number;
  limitMinutes: number;
};

type CommentComposeContextProps = {
  replyToUsername?: string;
  replyPreview: ExtractedImageContent | null;
  postTitle: string;
  postThumbnail?: string;
  replyToContent?: string;
  isEditMode: boolean;
  editability: Editability | null;
};

export function CommentComposeContext({
  replyToUsername,
  replyPreview,
  postTitle,
  postThumbnail,
  replyToContent,
  isEditMode,
  editability,
}: CommentComposeContextProps) {
  const { theme } = useUnistyles();

  return (
    <>
      {replyToUsername ? (
        <View style={styles.replyBanner}>
          <Text size="xs" mode="subtle">
            Replying to{" "}
            <Text
              size="xs"
              weight="semibold"
              style={{ color: theme.colors.brand[500] }}
            >
              @{replyToUsername}
            </Text>
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.postPreview,
          { borderBottomColor: theme.colors.border.subtle },
        ]}
      >
        <View style={styles.postPreviewInfo}>
          <Text
            size="md"
            weight={replyPreview ? "regular" : "bold"}
            numberOfLines={2}
          >
            {replyPreview ? replyPreview.text || postTitle : postTitle}
          </Text>
        </View>
        {replyPreview && replyPreview.imageUrls.length > 0 ? (
          <Image
            source={{ uri: replyPreview.imageUrls[0] }}
            style={styles.postPreviewThumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : !replyToContent && postThumbnail ? (
          <Image
            source={{ uri: postThumbnail }}
            style={styles.postPreviewThumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
      </View>

      {isEditMode && editability && !editability.allowed ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: `${theme.colors.error[500]}20`,
            },
          ]}
        >
          <Text size="sm" style={{ color: theme.colors.error[500] }}>
            Editing time has expired. Your tier allows editing up to {editability.limitMinutes} minutes after publishing.
          </Text>
        </View>
      ) : null}

      {isEditMode &&
      editability &&
      editability.allowed &&
      editability.remainingMinutes !== Infinity ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: `${theme.colors.warning[500]}15`,
            },
          ]}
        >
          <Text size="sm" style={{ color: theme.colors.warning[500] }}>
            {editability.remainingMinutes} min remaining to edit this comment
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  replyBanner: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  postPreview: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  postPreviewInfo: {
    flex: 1,
    gap: 2,
  },
  postPreviewThumbnail: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    marginLeft: theme.spacing.sm,
  },
  notice: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
}));
