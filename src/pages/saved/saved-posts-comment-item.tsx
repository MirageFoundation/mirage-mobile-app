import { memo, useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useUnistyles } from "react-native-unistyles";

import { TimeAgo } from "@/src/components/atoms";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { Text } from "@/src/components/ui/primitives";
import { MediaPreviewModal } from "@/src/components/molecules/media-preview-modal";
import { triggerHaptic } from "@/src/components/utils/haptics";
import type { SavedComment } from "@/src/stores";

import {
  extractImageUrls,
  SAVED_POSTS_MEDIA_HORIZONTAL_PADDING,
  SAVED_POSTS_SCREEN_WIDTH,
} from "./saved-posts-utils";

const CommentImage = memo(({ onPress, url }: { onPress?: (url: string) => void; url: string }) => {
  const { theme } = useUnistyles();
  const [hasError, setHasError] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const mediaSource = useMemo(() => ({ uri: url }), [url]);
  const mediaMaxHeight = 450;
  const containerWidth = SAVED_POSTS_SCREEN_WIDTH - SAVED_POSTS_MEDIA_HORIZONTAL_PADDING;
  const calculatedHeight = containerWidth / aspectRatio;
  const exceedsMaxHeight = calculatedHeight > mediaMaxHeight;
  const mediaWrapperStyle = exceedsMaxHeight
    ? { height: mediaMaxHeight }
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
          if (!onPress) return;
          triggerHaptic("selection");
          onPress(url);
        }}
      >
        <Image
          source={mediaSource}
          style={styles.commentImage}
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
        {!mediaLoaded ? (
          <View style={styles.skeletonOverlay}>
            <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
});
CommentImage.displayName = "CommentImage";

export const SavedCommentItem = memo(function SavedCommentItem({
  comment,
  onPress,
}: {
  comment: SavedComment;
  onPress: (comment: SavedComment) => void;
}) {
  const { theme } = useUnistyles();
  const displayPoints = comment.likes - (comment.dislikes ?? 0);
  const hasUpvoted = comment.hasLiked;
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const { imageUrls, text: commentText } = useMemo(
    () => extractImageUrls(comment.content),
    [comment.content],
  );

  const handleImagePress = useCallback((url: string) => {
    setPreviewImageUrl(url);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImageUrl(null);
  }, []);

  return (
    <>
      <Pressable onPress={() => onPress(comment)} style={styles.commentContainer}>
        <View style={styles.commentMetaRow}>
          <TimeAgo
            timestamp={
              typeof comment.createdAt === "number"
                ? comment.createdAt
                : new Date(comment.createdAt).getTime()
            }
            showSuffix={false}
            size="sm"
          />
          <Text size="sm" mode="subtle" style={styles.commentDot}>
            ·
          </Text>
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
        <View>
          {commentText.length > 0 ? <MarkdownContent content={commentText} /> : null}
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
SavedCommentItem.displayName = "SavedCommentItem";

const styles = {
  commentContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  commentMetaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 8,
  },
  commentDot: {
    marginHorizontal: 4,
  },
  mediaContainer: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  mediaWrapper: {
    width: "100%" as const,
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  commentImage: {
    width: "100%" as const,
    height: "100%" as const,
  },
  imageError: {
    width: "100%" as const,
    height: 100,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 8,
    marginBottom: 4,
  },
  skeletonOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
