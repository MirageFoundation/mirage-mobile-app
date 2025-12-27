import { useState } from "react";
import { View, Pressable, type ViewStyle, type StyleProp } from "react-native";
import { Image } from "expo-image";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import {
  Avatar,
  TimeAgo,
  TopicChip,
  FollowButton,
  ContentWarningBadge,
  type ContentWarningType,
} from "@/src/components/atoms";
import { PostActions } from "./post-actions";
import { triggerHaptic } from "@/src/components/utils/haptics";

export type PostAuthor = {
  id: string;
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
};

export type PostMedia = {
  uri: string;
  type: "image" | "video" | "gif";
  width?: number;
  height?: number;
  aspectRatio?: number;
};

export type Post = {
  id: string;
  author: PostAuthor;
  title: string;
  body?: string;
  topic?: string;
  media?: PostMedia[];
  contentWarnings?: ContentWarningType[];
  likes: number;
  dislikes: number;
  comments: number;
  hasLiked?: boolean;
  hasDisliked?: boolean;
  isFollowing?: boolean;
  createdAt: Date | string | number;
};

type PostCardProps = {
  /** Post data */
  post: Post;
  /** Whether the current user is the author */
  isOwnPost?: boolean;
  /** Callback when the post card is pressed */
  onPress?: () => void;
  /** Callback when author avatar/username is pressed */
  onAuthorPress?: () => void;
  /** Callback when topic is pressed */
  onTopicPress?: () => void;
  /** Callback when follow button is pressed */
  onFollowPress?: () => void;
  /** Callback when like is pressed */
  onLikePress?: () => void;
  /** Callback when dislike is pressed */
  onDislikePress?: () => void;
  /** Callback when comment is pressed */
  onCommentPress?: () => void;
  /** Callback when share is pressed */
  onSharePress?: () => void;
  /** Callback when content warning is pressed to reveal */
  onRevealContent?: () => void;
  /** Whether content has been revealed (for NSFW posts) */
  contentRevealed?: boolean;
  /** Follow button loading state */
  followLoading?: boolean;
  /** URL for sharing */
  shareUrl?: string;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
};

export const PostCard = ({
  post,
  isOwnPost = false,
  onPress,
  onAuthorPress,
  onTopicPress,
  onFollowPress,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onSharePress,
  onRevealContent,
  contentRevealed = false,
  followLoading = false,
  shareUrl,
  style,
}: PostCardProps) => {
  const { theme } = useUnistyles();
  const [imageError, setImageError] = useState(false);

  const {
    author,
    title,
    body,
    topic,
    media,
    contentWarnings,
    likes,
    dislikes,
    comments,
    hasLiked,
    hasDisliked,
    isFollowing,
    createdAt,
  } = post;

  const hasContentWarning = contentWarnings && contentWarnings.length > 0;
  const shouldBlurContent = hasContentWarning && !contentRevealed;
  const primaryMedia = media?.[0];
  const hasMultipleMedia = media && media.length > 1;

  // Calculate aspect ratio for media
  const getMediaAspectRatio = () => {
    if (primaryMedia?.aspectRatio) return primaryMedia.aspectRatio;
    if (primaryMedia?.width && primaryMedia?.height) {
      return primaryMedia.width / primaryMedia.height;
    }
    return 16 / 9; // Default aspect ratio
  };

  const handlePress = () => {
    triggerHaptic("selection");
    onPress?.();
  };

  const handleAuthorPress = () => {
    triggerHaptic("selection");
    onAuthorPress?.();
  };

  return (
    <Pressable onPress={handlePress} style={[styles.container, style]}>
      {/* Header: Avatar, Username, Time, Topic, Follow */}
      <View style={styles.header}>
        <Pressable onPress={handleAuthorPress} style={styles.authorSection}>
          <Avatar
            size="md"
            seed={author.avatarSeed ?? author.username}
            source={author.avatarUrl ? { uri: author.avatarUrl } : undefined}
          />
          <View style={styles.authorInfo}>
            <View style={styles.authorRow}>
              <Text size="sm" weight="semibold" numberOfLines={1}>
                @{author.username}
              </Text>
              <TimeAgo timestamp={createdAt} showSuffix={false} />
            </View>
            {topic && (
              <TopicChip
                label={topic}
                size="sm"
                onPress={onTopicPress}
                style={{ marginTop: 2 }}
              />
            )}
          </View>
        </Pressable>

        {/* Follow button - don't show for own posts */}
        {!isOwnPost && (
          <FollowButton
            isFollowing={isFollowing ?? false}
            onPress={onFollowPress}
            loading={followLoading}
            size="sm"
          />
        )}
      </View>

      {/* Content Warning Badge */}
      {hasContentWarning && (
        <View style={styles.warningBadge}>
          <ContentWarningBadge
            types={contentWarnings}
            onPress={onRevealContent}
            compact
          />
        </View>
      )}

      {/* Title */}
      <Text
        size="lg"
        weight="semibold"
        style={styles.title}
        numberOfLines={shouldBlurContent ? 1 : 3}
      >
        {title}
      </Text>

      {/* Media */}
      {primaryMedia && !imageError && (
        <View style={styles.mediaContainer}>
          <View
            style={[
              styles.mediaWrapper,
              { aspectRatio: getMediaAspectRatio() },
            ]}
          >
            <Image
              source={{ uri: primaryMedia.uri }}
              style={styles.media}
              contentFit="cover"
              cachePolicy="memory-disk"
              onError={() => setImageError(true)}
              blurRadius={shouldBlurContent ? 30 : 0}
            />

            {/* Play button for videos */}
            {primaryMedia.type === "video" && (
              <View style={styles.playOverlay}>
                <View style={styles.playButton}>
                  <Text size="xl" style={{ color: "#fff" }}>
                    ▶
                  </Text>
                </View>
              </View>
            )}

            {/* GIF badge */}
            {primaryMedia.type === "gif" && (
              <View style={styles.gifBadge}>
                <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                  GIF
                </Text>
              </View>
            )}

            {/* Multiple media indicator */}
            {hasMultipleMedia && (
              <View style={styles.multiMediaBadge}>
                <Text size="xs" weight="semibold" style={{ color: "#fff" }}>
                  +{media.length - 1}
                </Text>
              </View>
            )}

            {/* Blur overlay with reveal button */}
            {shouldBlurContent && (
              <Pressable
                onPress={onRevealContent}
                style={styles.blurOverlay}
              >
                <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                  Tap to reveal
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Body text */}
      {body && !shouldBlurContent && (
        <Text
          size="md"
          mode="default"
          style={styles.body}
          numberOfLines={4}
        >
          {body}
        </Text>
      )}

      {/* Actions */}
      <PostActions
        likes={likes}
        dislikes={dislikes}
        comments={comments}
        hasLiked={hasLiked}
        hasDisliked={hasDisliked}
        onLikePress={onLikePress}
        onDislikePress={onDislikePress}
        onCommentPress={onCommentPress}
        onSharePress={onSharePress}
        shareUrl={shareUrl}
        shareTitle={title}
        style={styles.actions}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.background.default,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  authorInfo: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  warningBadge: {
    marginTop: theme.spacing.sm,
  },
  title: {
    marginTop: theme.spacing.sm,
    lineHeight: 24,
  },
  mediaContainer: {
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  mediaWrapper: {
    width: "100%",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  gifBadge: {
    position: "absolute",
    bottom: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  multiMediaBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  body: {
    marginTop: theme.spacing.sm,
    lineHeight: 22,
  },
  actions: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
}));

