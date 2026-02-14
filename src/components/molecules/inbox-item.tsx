import type { InboxReply } from "@/src/api/types";
import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { MediaPreviewModal } from "./media-preview-modal";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { getUsernameColor } from "@/src/utils/tiers";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const IMAGE_URL_REGEX = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))$/i;
const CLOUDFLARE_IMAGE_REGEX = /^https?:\/\/imagedelivery\.net\/[^\s]+$/i;
const GIPHY_URL_REGEX =
  /^https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+$/i;

function isImageUrl(url: string): boolean {
  return (
    IMAGE_URL_REGEX.test(url) ||
    CLOUDFLARE_IMAGE_REGEX.test(url) ||
    GIPHY_URL_REGEX.test(url)
  );
}

function extractImageUrls(content: string): {
  text: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];
  const textLines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (isImageUrl(trimmed)) {
      imageUrls.push(trimmed);
    } else {
      textLines.push(line);
    }
  }
  return { text: textLines.join("\n").trim(), imageUrls };
}

const PARENT_PREVIEW_MAX_LENGTH = 80;

function truncateParentContent(content: string): string {
  const singleLine = content.replace(/\n/g, " ").trim();
  if (singleLine.length <= PARENT_PREVIEW_MAX_LENGTH) return singleLine;
  return singleLine.slice(0, PARENT_PREVIEW_MAX_LENGTH).trimEnd() + "…";
}

const ReplyImage = ({
  url,
  onPress,
}: {
  url: string;
  onPress?: () => void;
}) => {
  const { theme } = useUnistyles();
  const [hasError, setHasError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const MEDIA_MAX_HEIGHT = 300;
  const containerWidth = 350;
  const calculatedHeight = containerWidth / aspectRatio;
  const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
  const containerStyle = exceedsMaxHeight
    ? { height: MEDIA_MAX_HEIGHT }
    : { aspectRatio };

  if (hasError) {
    return (
      <View
        style={[
          styles.imageError,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
        <Text size="xs" mode="subtle">
          Failed to load image
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.imageContainer, containerStyle]}
      onPress={() => {
        if (onPress) {
          triggerHaptic("selection");
          onPress();
        }
      }}
    >
      <Image
        source={{ uri: url }}
        style={styles.image}
        contentFit="cover"
        transition={200}
        onLoad={({ source }) => {
          if (source?.width && source?.height) {
            setAspectRatio(source.width / source.height);
          }
        }}
        onError={() => setHasError(true)}
      />
    </Pressable>
  );
};

interface InboxItemProps {
  reply: InboxReply;
  onPress: (rootPostId: string, replyId: string) => void;
  isUnread?: boolean;
}

export const InboxItem = memo(function InboxItem({
  reply,
  onPress,
  isUnread,
}: InboxItemProps) {
  const { theme } = useUnistyles();
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const handlePress = useCallback(() => {
    triggerHaptic("selection");
    onPress(reply.root_post_id, reply.reply_id);
  }, [onPress, reply.root_post_id, reply.reply_id]);

  const handleImagePress = useCallback((url: string) => {
    setPreviewImageUrl(url);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImageUrl(null);
  }, []);

  const parentPreview = useMemo(
    () => truncateParentContent(reply.parent_content),
    [reply.parent_content],
  );

  const { text: replyText, imageUrls } = useMemo(
    () => extractImageUrls(reply.reply_content),
    [reply.reply_content],
  );

  return (
    <>
      <Pressable
        onPress={handlePress}
        style={[
          styles.container,
          isUnread && styles.unreadContainer,
        ]}
      >
        <View style={styles.headerTextRow}>
          <View style={styles.headerLeft}>
            <Ionicons
              name="arrow-undo-outline"
              size={16}
              color={theme.colors.text.subtle}
            />
            <Text
              size="sm"
              weight="semibold"
              numberOfLines={1}
              style={[
                styles.headerText,
                getUsernameColor(reply.reply_author_level)
                  ? { color: getUsernameColor(reply.reply_author_level) }
                  : undefined,
              ]}
            >
              {reply.reply_username}
            </Text>
            <Text size="sm" mode="subtle" numberOfLines={1}>
              replied to
            </Text>
            <Text
              size="sm"
              mode="subtle"
              numberOfLines={1}
              style={styles.parentPreview}
            >
              {`"${parentPreview}"`}
            </Text>
          </View>
          <TimeAgo
            timestamp={reply.reply_timestamp * 1000}
            showSuffix={false}
            size="sm"
          />
        </View>

        <View style={styles.replyContent}>
          {replyText.length > 0 && <MarkdownContent content={replyText} />}
          {imageUrls.map((url, index) => (
            <ReplyImage
              key={`img-${index}`}
              url={url}
              onPress={() => handleImagePress(url)}
            />
          ))}
        </View>
      </Pressable>

      <MediaPreviewModal
        visible={!!previewImageUrl}
        media={previewImageUrl ? { type: "image", uri: previewImageUrl } : null}
        onClose={handleClosePreview}
      />
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.background.default,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  unreadContainer: {
    backgroundColor: `${theme.colors.primary[500]}08`,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary[500],
  },
  unreadDot: {
    position: "absolute",
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary[500],
  },
  headerTextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    marginBottom: theme.spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  headerText: {
    flexShrink: 0,
  },
  parentPreview: {
    flexShrink: 1,
  },
  replyContent: {},
  imageContainer: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.background.subtle,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  imageError: {
    width: "100%",
    height: 100,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
}));
