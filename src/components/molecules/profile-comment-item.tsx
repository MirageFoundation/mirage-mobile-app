import { useRootPostId } from "@/src/api/read";
import type { Post } from "@/src/api/types";
import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { MediaPreviewModal } from "./media-preview-modal";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, View } from "react-native";
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

const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;

const CommentImage = memo(({ url, onPress }: { url: string; onPress?: (url: string) => void }) => {
  const { theme } = useUnistyles();
  const [hasError, setHasError] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const mediaSource = useMemo(() => ({ uri: url }), [url]);

  const MEDIA_MAX_HEIGHT = 450;
  const containerWidth = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
  const calculatedHeight = containerWidth / aspectRatio;
  const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
  const mediaWrapperStyle = exceedsMaxHeight
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
    <View style={styles.mediaContainer}>
      <Pressable
        style={[styles.mediaWrapper, mediaWrapperStyle]}
        onPress={() => {
          if (onPress) {
            triggerHaptic("selection");
            onPress(url);
          }
        }}
      >
        <Image
          source={mediaSource}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={url}
          onLoad={({ source }) => {
            if (source?.width && source?.height) {
              setAspectRatio(source.width / source.height);
            }
            setMediaLoaded(true);
          }}
          onError={() => setHasError(true)}
        />
        {!mediaLoaded && (
          <View style={styles.skeletonOverlay}>
            <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
          </View>
        )}
      </Pressable>
    </View>
  );
});
interface ProfileCommentItemProps {
  comment: Post;
  onPress: (commentId: string, rootPostId: string) => void;
  onEditPress?: (comment: Post, rootPostId: string) => void;
  onDeletePress?: (comment: Post) => void;
}

export const ProfileCommentItem = memo(function ProfileCommentItem({
  comment,
  onPress,
  onEditPress,
  onDeletePress,
}: ProfileCommentItemProps) {
 const { theme } = useUnistyles();
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

 const hasValidRootPostId = useMemo(() => {
    return (
      comment.root_post_id &&
      comment.root_post_id.trim() !== "" &&
      comment.root_post_id !== "undefined"
    );
  }, [comment.root_post_id]);

  const { data: rootPostData, isLoading: isLoadingRootPostId } = useRootPostId(
    !hasValidRootPostId ? comment.post_id : null,
  );

  const resolvedRootPostId = useMemo(() => {
    if (hasValidRootPostId) {
      return comment.root_post_id;
    }
    return rootPostData?.root_post_id || null;
  }, [hasValidRootPostId, comment.root_post_id, rootPostData]);

  const isLoading = !hasValidRootPostId && isLoadingRootPostId;

  const handlePress = useCallback(() => {
    if (!resolvedRootPostId) {
      return;
    }
    triggerHaptic("selection");
    onPress(comment.post_id, resolvedRootPostId);
  }, [onPress, comment.post_id, resolvedRootPostId]);

  const handleEditPress = useCallback(() => {
    if (!resolvedRootPostId) return;
    triggerHaptic("selection");
    onEditPress?.(comment, resolvedRootPostId);
  }, [onEditPress, comment, resolvedRootPostId]);

 const handleDeletePress = useCallback(() => {
   triggerHaptic("warning");
   onDeletePress?.(comment);
 }, [onDeletePress, comment]);

  const handleImagePress = useCallback((url: string) => {
    setPreviewImageUrl(url);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImageUrl(null);
  }, []);

 const displayPoints = Math.round(
    comment.points - comment.user_weight + comment.user_vote,
  );

  const { text: commentText, imageUrls } = useMemo(
    () => extractImageUrls(comment.content),
    [comment.content],
  );
  const hasUpvoted = comment.user_vote === 1;

 return (
    <>
   <Pressable
     onPress={handlePress}
     style={[styles.container, isLoading && styles.containerLoading]}
     disabled={isLoading}
   >
      <View style={styles.metaRow}>
        <TimeAgo
          timestamp={comment.timestamp * 1000}
          showSuffix={false}
          size="sm"
        />

        <Text size="sm" mode="subtle" style={styles.dot}>
          ·
        </Text>

        <View style={styles.upvoteContainer}>
          <Text
            size="sm"
            weight={hasUpvoted ? "semibold" : "regular"}
            style={{
              color: hasUpvoted
                ? theme.colors.success[500]
                : theme.colors.text.subtle,
            }}
          >
            {displayPoints} points
          </Text>
        </View>



        <View style={styles.actionsRow}>
          {onEditPress && (
            <Pressable
              onPress={handleEditPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.actionButton}
            >
              <Feather
                name="edit-2"
                size={14}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          )}
          {onDeletePress && (
            <Pressable
              onPress={handleDeletePress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.actionButton}
            >
              <Feather
                name="trash-2"
                size={14}
                color={theme.colors.error[500]}
              />
            </Pressable>
          )}
        </View>
      </View>

    <View>
       {commentText.length > 0 && (
         <MarkdownContent content={commentText} />
       )}
       {imageUrls.map((url, index) => (
          <CommentImage 
            key={`img-${index}`} 
            url={url} 
            onPress={handleImagePress}
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
  containerLoading: {
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  dot: {
    marginHorizontal: theme.spacing.xs,
  },
  upvoteContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    gap: theme.spacing.md,
  },
  actionButton: {
    padding: 4,
  },
 mediaContainer: {
   marginTop: theme.spacing.sm,
   marginBottom: theme.spacing.xs,
   borderRadius: theme.radius.md,
   overflow: "hidden",
 },
 mediaWrapper: {
   width: "100%",
   backgroundColor: theme.colors.background.subtle,
   borderRadius: theme.radius.md,
   overflow: "hidden",
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
  skeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.md,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  commentText: {
    lineHeight: 22,
  },
}));
