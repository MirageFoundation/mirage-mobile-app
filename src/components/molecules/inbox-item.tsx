import type { InboxReply } from "@/src/api/types";
import { getAwardInfo } from "@/src/data/awards";
import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { MediaPreviewModal } from "./media-preview-modal";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { getUsernameColor } from "@/src/utils/tiers";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
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

export function extractImageUrls(content: string): {
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

const ASPECT_RATIO_CACHE = new Map<string, number>();
const MEDIA_MAX_HEIGHT = 210;
const CONTAINER_WIDTH = 350;

type ImageState = {
  status: "loading" | "loaded" | "error";
  aspectRatio: number;
  retryKey: number;
};

const ReplyImage = ({
  url,
  onPress,
}: {
  url: string;
  onPress?: () => void;
}) => {
  const { theme } = useUnistyles();
  const [state, setState] = useState<ImageState>(() => ({
    status: "loading",
    aspectRatio: ASPECT_RATIO_CACHE.get(url) ?? 16 / 9,
    retryKey: 0,
  }));
  const retryCount = useRef(0);

  const calculatedHeight = CONTAINER_WIDTH / state.aspectRatio;
  const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
  const containerStyle = exceedsMaxHeight
    ? { height: MEDIA_MAX_HEIGHT }
    : { aspectRatio: state.aspectRatio };

  const handleError = useCallback(() => {
    if (retryCount.current < 2) {
      retryCount.current += 1;
      setState((prev) => ({ ...prev, retryKey: prev.retryKey + 1 }));
    } else {
      setState((prev) => ({ ...prev, status: "error" }));
    }
  }, []);

  const handleLoad = useCallback(({ source }: { source: { width: number; height: number } }) => {
    if (source?.width && source?.height) {
      const ratio = source.width / source.height;
      ASPECT_RATIO_CACHE.set(url, ratio);
      setState((prev) => {
        const ratioChanged = Math.abs(prev.aspectRatio - ratio) >= 0.01;
        if (prev.status === "loaded" && !ratioChanged) return prev;
        return {
          ...prev,
          status: "loaded",
          aspectRatio: ratioChanged ? ratio : prev.aspectRatio,
        };
      });
    } else {
      setState((prev) =>
        prev.status === "loaded" ? prev : { ...prev, status: "loaded" },
      );
    }
  }, [url]);

  if (state.status === "error") {
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
      {state.status === "loading" && (
        <View style={styles.imagePlaceholder}>
          <ActivityIndicator size="small" color={theme.colors.text.subtle} />
        </View>
      )}
      <Image
        source={{ uri: url }}
        style={styles.image}
        contentFit="cover"
        transition={200}
        recyclingKey={`${url}-${state.retryKey}`}
        cachePolicy="memory-disk"
        onLoad={handleLoad}
        onError={handleError}
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

  const isAward = reply.type === "award";
  const isMention = reply.type === "mention";
  const awardInfo = isAward ? getAwardInfo(reply.award_type ?? "") : undefined;
  const actionLabel = isAward
    ? `gave your post a '${awardInfo?.label ?? ""}' award`
    : isMention ? "mentioned you in" : "replied to";
  const actionIcon = isAward
    ? "gift-outline"
    : isMention ? "at-outline" : "arrow-undo-outline";

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
          <Ionicons
            name={actionIcon}
            size={16}
            color={theme.colors.text.subtle}
            style={styles.headerIcon}
          />
          <Text size="sm" style={styles.headerLeft}>
            <Text
              size="sm"
              weight="semibold"
              style={
                getUsernameColor(reply.reply_author_level)
                  ? { color: getUsernameColor(reply.reply_author_level) }
                  : undefined
              }
            >
              {reply.reply_username}
            </Text>
            <Text size="sm" mode="subtle">
              {" "}{actionLabel}{" "}
            </Text>
            <Text size="sm" mode="subtle">
              {`"${parentPreview}"`}
            </Text>
          </Text>
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
              key={url}
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
}, (prev, next) => {
  return (
    prev.reply.reply_id === next.reply.reply_id &&
    prev.reply.reply_content === next.reply.reply_content &&
    prev.isUnread === next.isUnread &&
    prev.onPress === next.onPress
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
    alignItems: "flex-start",
    gap: 4,
    marginBottom: theme.spacing.sm,
  },
  headerIcon: {
    marginTop: 2,
  },
  headerLeft: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  replyContent: {},
  imageContainer: {
    width: "70%",
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
    width: "70%",
    height: 100,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
}));
