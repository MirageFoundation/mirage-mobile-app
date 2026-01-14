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
import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "mpeg",
  "mpg",
  "m3u8",
  "mpd",
]);

const MEDIA_ASPECT_RATIO_CACHE = new Map<string, number>();

function normalizeVideoUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("videodelivery.net")) {
      if (parsedUrl.pathname.endsWith("/iframe")) {
        parsedUrl.pathname = parsedUrl.pathname.replace(
          "/iframe",
          "/manifest/video.m3u8"
        );
        return parsedUrl.toString();
      }
      if (parsedUrl.pathname.endsWith("/manifest")) {
        parsedUrl.pathname = `${parsedUrl.pathname}/video.m3u8`;
        return parsedUrl.toString();
      }
    }
  } catch {
    if (url.includes("videodelivery.net") && url.endsWith("/iframe")) {
      return url.replace("/iframe", "/manifest/video.m3u8");
    }
    if (url.includes("videodelivery.net") && url.endsWith("/manifest")) {
      return `${url}/video.m3u8`;
    }
  }

  return url;
}

function getMediaTypeFromUrl(url: string): "image" | "video" | "gif" {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("videodelivery.net")) {
      return "video";
    }
    const path = parsedUrl.pathname.toLowerCase();
    const extension = path.split(".").pop() ?? "";
    if (extension === "gif") return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  } catch {
    const path = url.toLowerCase().split("?")[0];
    const extension = path.split(".").pop() ?? "";
    if (url.includes("videodelivery.net")) return "video";
    if (extension === "gif") return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  }

  return "image";
}

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
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<Video | null>(null);
  const aspectRatioLockedRef = useRef(false);

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
  const mediaCount = media?.length ?? 0;
  const hasMultipleMedia = mediaCount > 1;
  const extraMediaCount = mediaCount > 0 ? mediaCount - 1 : 0;

  // Extract URL from body
  const extractedUrl = body ? extractFirstUrl(body) : null;
  const bodyWithoutUrl = body ? removeUrls(body) : undefined;
  const displayDomain = extractedUrl ? extractDomain(extractedUrl) : null;
  const bodyVideoUrl =
    extractedUrl && getMediaTypeFromUrl(extractedUrl) === "video"
      ? normalizeVideoUrl(extractedUrl)
      : null;
  const resolvedMedia = bodyVideoUrl
    ? { uri: bodyVideoUrl, type: "video" as const }
    : primaryMedia
    ? {
        ...primaryMedia,
        uri:
          primaryMedia.type === "video"
            ? normalizeVideoUrl(primaryMedia.uri)
            : primaryMedia.uri,
      }
    : undefined;
  const resolvedMediaType = resolvedMedia?.type;
  const isVideo = resolvedMedia?.type === "video";

  const handlePlayNowPress = () => {
    if (extractedUrl) {
      triggerHaptic("selection");
      Linking.openURL(extractedUrl);
    }
  };

  // Calculate aspect ratio for media
  const getMediaAspectRatio = () => {
    if (resolvedMedia?.aspectRatio) return resolvedMedia.aspectRatio;
    if (resolvedMedia?.width && resolvedMedia?.height) {
      return resolvedMedia.width / resolvedMedia.height;
    }
    return 16 / 9; // Default aspect ratio
  };

  const resolvedMediaUri = resolvedMedia?.uri;
  const cachedAspectRatio = resolvedMediaUri
    ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
    : undefined;
  const [mediaAspectRatio, setMediaAspectRatio] = useState(
    cachedAspectRatio ?? getMediaAspectRatio()
  );

  useEffect(() => {
    const cached = resolvedMediaUri
      ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
      : undefined;
    if (cached) {
      setMediaAspectRatio((current) =>
        Math.abs(current - cached) < 0.01 ? current : cached
      );
      aspectRatioLockedRef.current = true;
      return;
    }

    setMediaAspectRatio(getMediaAspectRatio());
    aspectRatioLockedRef.current = false;
  }, [
    resolvedMedia?.aspectRatio,
    resolvedMedia?.width,
    resolvedMedia?.height,
    resolvedMediaUri,
    bodyVideoUrl,
  ]);

  useEffect(() => {
    if (!isVideo || shouldBlurContent) {
      setIsVideoPlaying(false);
    }
  }, [isVideo, shouldBlurContent, resolvedMedia?.uri]);

  const updateMediaAspectRatioFromSize = useCallback(
    (width?: number, height?: number) => {
      if (!width || !height) return;
      if (aspectRatioLockedRef.current) return;
      const ratio = width / height;
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      setMediaAspectRatio((current) =>
        Math.abs(current - ratio) < 0.01 ? current : ratio
      );
      if (resolvedMediaUri) {
        MEDIA_ASPECT_RATIO_CACHE.set(resolvedMediaUri, ratio);
      }
      aspectRatioLockedRef.current = true;
    },
    [resolvedMediaUri]
  );

  const mediaSource = useMemo(
    () => ({ uri: resolvedMediaUri ?? "" }),
    [resolvedMediaUri]
  );

  const handleVideoToggle = useCallback(async () => {
    if (!isVideo) return;
    if (shouldBlurContent) {
      onRevealContent?.();
      return;
    }

    try {
      const status = await videoRef.current?.getStatusAsync();
      if (!status || !status.isLoaded) {
        setIsVideoPlaying(true);
        return;
      }
      if (status.isPlaying) {
        await videoRef.current?.pauseAsync();
        setIsVideoPlaying(false);
        return;
      }
      if (status.didJustFinish) {
        await videoRef.current?.replayAsync();
      } else {
        await videoRef.current?.playAsync();
      }
      setIsVideoPlaying(true);
    } catch {
      // Ignore transient playback errors.
    }
  }, [isVideo, onRevealContent, shouldBlurContent]);

  const mediaContent = useMemo(() => {
    if (!resolvedMediaUri || imageError) return null;

    return (
      <View style={styles.mediaContainer}>
        <View style={[styles.mediaWrapper, { aspectRatio: mediaAspectRatio }]}>
          {isVideo ? (
            <Video
              ref={videoRef}
              source={mediaSource}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              shouldPlay={isVideoPlaying}
              useNativeControls={false}
              onLoad={(status) => {
                if (!status.isLoaded) return;
                const { width, height } = status.naturalSize ?? {};
                updateMediaAspectRatioFromSize(width, height);
              }}
              onReadyForDisplay={(event) => {
                const { width, height } = event.naturalSize ?? {};
                updateMediaAspectRatioFromSize(width, height);
              }}
              onPlaybackStatusUpdate={(status) => {
                if (!status.isLoaded) return;
                if (status.didJustFinish) {
                  setIsVideoPlaying(false);
                }
              }}
              onError={() => setImageError(true)}
            />
          ) : (
            <Image
              source={mediaSource}
              style={styles.media}
              contentFit="cover"
              cachePolicy="memory-disk"
              onLoad={({ source }) => {
                updateMediaAspectRatioFromSize(source?.width, source?.height);
              }}
              onError={() => setImageError(true)}
              blurRadius={shouldBlurContent ? 30 : 0}
            />
          )}

          {/* Play button for videos */}
          {isVideo && !shouldBlurContent && (
            <Pressable
              onPress={(event) => {
                event.stopPropagation?.();
                handleVideoToggle();
              }}
              style={styles.playOverlay}
            >
              <View
                style={[
                  styles.playButton,
                  { opacity: isVideoPlaying ? 0.6 : 1 },
                ]}
              >
                <Ionicons
                  name={isVideoPlaying ? "pause" : "play"}
                  size={28}
                  color="#fff"
                />
              </View>
            </Pressable>
          )}

          {/* GIF badge */}
          {resolvedMediaType === "gif" && (
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
                +{extraMediaCount}
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
    );
  }, [
    resolvedMediaUri,
    resolvedMediaType,
    imageError,
    mediaAspectRatio,
    isVideo,
    isVideoPlaying,
    shouldBlurContent,
    hasMultipleMedia,
    extraMediaCount,
    mediaSource,
    updateMediaAspectRatioFromSize,
    handleVideoToggle,
    onRevealContent,
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
          <Pressable
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={handleMorePress}
            style={styles.moreButton}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color={theme.colors.text.default}
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
      {mediaContent}

      {/* Body text (without URL) */}
      {bodyWithoutUrl && !shouldBlurContent && (
        <Text size="sm" mode="default" style={styles.body} numberOfLines={4}>
          {bodyWithoutUrl}
        </Text>
      )}

      {/* URL Link Card */}
      {extractedUrl && displayDomain && !shouldBlurContent && !bodyVideoUrl && (
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
