import {
  Avatar,
  ContentWarningBadge,
  FollowButton,
  TimeAgo,
  type ContentWarningType,
} from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PostActions } from "./post-actions";

// URL regex pattern to detect URLs in text
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

/**
 * Extract the domain name from a URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove 'www.' prefix if present
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Extract the first URL from text
 */
function extractFirstUrl(text: string): string | null {
  const matches = text.match(URL_REGEX);
  return matches ? matches[0] : null;
}

/**
 * Remove URLs from text for display
 */
function removeUrls(text: string): string {
  return text.replace(URL_REGEX, "").trim();
}

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
  /** Callback when follow button is pressed */
  onFollowPress?: () => void;
  /** Callback when more options (three dots) is pressed */
  onMorePress?: () => void;
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
  onFollowPress,
  onMorePress,
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

  // Extract URL from body
  const extractedUrl = body ? extractFirstUrl(body) : null;
  const bodyWithoutUrl = body ? removeUrls(body) : undefined;
  const displayDomain = extractedUrl ? extractDomain(extractedUrl) : null;

  const handlePlayNowPress = () => {
    if (extractedUrl) {
      triggerHaptic("selection");
      Linking.openURL(extractedUrl);
    }
  };

  // Calculate aspect ratio for media
  const getMediaAspectRatio = () => {
    if (primaryMedia?.aspectRatio) return primaryMedia.aspectRatio;
    if (primaryMedia?.width && primaryMedia?.height) {
      return primaryMedia.width / primaryMedia.height;
    }
    return 16 / 9; // Default aspect ratio
  };

  const [mediaAspectRatio, setMediaAspectRatio] = useState(
    getMediaAspectRatio(),
  );

  useEffect(() => {
    setMediaAspectRatio(getMediaAspectRatio());
  }, [
    primaryMedia?.aspectRatio,
    primaryMedia?.width,
    primaryMedia?.height,
    primaryMedia?.uri,
  ]);

  const handlePress = () => {
    triggerHaptic("selection");
    onPress?.();
  };

  const handleAuthorPress = () => {
    triggerHaptic("selection");
    onAuthorPress?.();
  };

  const handleMorePress = () => {
    triggerHaptic("selection");
    onMorePress?.();
  };

  return (
    <Pressable onPress={handlePress} style={[styles.container, style]}>
      {/* Header: Avatar, Username, Time, Follow, More */}
      <View style={styles.header}>
        <Pressable onPress={handleAuthorPress} style={styles.authorSection}>
          <Avatar
            size="sm"
            seed={author.avatarSeed ?? author.username}
            source={author.avatarUrl ? { uri: author.avatarUrl } : undefined}
            bordered
          />
          <View style={styles.authorInfo}>
            <View style={styles.authorRow}>
              <Text size="sm" weight="semibold" numberOfLines={1}>
                @{author.username}
              </Text>
              <TimeAgo timestamp={createdAt} showSuffix={false} size="xs" />
            </View>
          </View>
        </Pressable>

        {/* Right section: Follow button + More options */}
        <View style={styles.headerActions}>
          {!isOwnPost && (
            <FollowButton
              isFollowing={isFollowing ?? false}
              onPress={onFollowPress}
              loading={followLoading}
              size="sm"
            />
          )}
          <Pressable onPress={handleMorePress} style={styles.moreButton}>
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color={theme.colors.text.subtle}
            />
          </Pressable>
        </View>
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
            style={[styles.mediaWrapper, { aspectRatio: mediaAspectRatio }]}
          >
            <Image
              source={{ uri: primaryMedia.uri }}
              style={styles.media}
              contentFit="cover"
              cachePolicy="memory-disk"
              onLoad={({ source }) => {
                if (!source?.width || !source?.height) return;
                const ratio = source.width / source.height;
                if (!Number.isFinite(ratio) || ratio <= 0) return;
                setMediaAspectRatio((current) =>
                  Math.abs(current - ratio) < 0.01 ? current : ratio,
                );
              }}
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
              <Pressable onPress={onRevealContent} style={styles.blurOverlay}>
                <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                  Tap to reveal
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Body text (without URL) */}
      {bodyWithoutUrl && !shouldBlurContent && (
        <Text size="sm" mode="default" style={styles.body} numberOfLines={4}>
          {bodyWithoutUrl}
        </Text>
      )}

      {/* URL Link Card */}
      {extractedUrl && displayDomain && !shouldBlurContent && (
        <View style={styles.urlCard}>
          <View style={styles.urlInfo}>
            <Ionicons
              name="globe-outline"
              size={16}
              color={theme.colors.text.subtle}
            />
            <Text
              size="sm"
              mode="subtle"
              numberOfLines={1}
              style={styles.domainText}
            >
              {displayDomain}
            </Text>
          </View>
          <Pressable onPress={handlePlayNowPress} style={styles.playNowButton}>
            <Text size="sm" weight="semibold" style={styles.playNowText}>
              Play Now
            </Text>
          </Pressable>
        </View>
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
    alignItems: "center",
    justifyContent: "space-between",
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  authorInfo: {
    flex: 1,
    marginLeft: theme.spacing.xs,
    justifyContent: "center",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  moreButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  warningBadge: {
    marginTop: theme.spacing.sm,
  },
  title: {
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
  mediaContainer: {
    marginTop: theme.spacing.sm,
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
    marginTop: theme.spacing.xs,
    lineHeight: 16,
  },
  urlCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing.sm,
  },
  urlInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    flex: 1,
  },
  domainText: {
    flex: 1,
  },
  playNowButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border.subtle,
  },
  playNowText: {
    color: theme.colors.text.default,
  },
  actions: {
    marginTop: theme.spacing.sm,
  },
}));
