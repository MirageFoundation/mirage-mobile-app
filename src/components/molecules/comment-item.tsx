import {
  DownvoteFilledIcon,
  UpvoteFilledIcon,
} from "@/assets/figma-icons";
import { AwardBadges } from "@/src/components/atoms/award-badges";
import { TimeAgo, FollowButton } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { MediaPreviewModal } from "./media-preview-modal";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrlOrInternal } from "@/src/utils/internal-link-handler";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  Animated as RNAnimated,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { getUsernameColor } from "@/src/utils/tiers";

// Vote colors (same as post-actions)
const UPVOTE_COLOR = "#22C55E"; // Green for upvote
const DOWNVOTE_COLOR = "#EF4444"; // Red for downvote
const NEW_USER_COLOR = "rgb(94,194,106)";

export type CommentAuthor = {
  id: string;
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
  level?: number;
  isNewUser?: boolean;
};

export type Comment = {
  id: string;
  author: CommentAuthor;
  content: string;
  likes: number;
  dislikes: number;
  hasLiked?: boolean;
  hasDisliked?: boolean;
  createdAt: Date | string | number;
  replies?: Comment[];
  replyCount?: number;
  parentId?: string | null;
  depth?: number;
  awards?: import("@/src/api/types").AwardBadge[];
};

type CommentItemProps = {
  /** Comment data */
  comment: Comment;
  /** Whether the current user is the author */
  isOwnComment?: boolean;
  /** Whether this comment is highlighted (navigated to from profile) */
  isHighlighted?: boolean;
  /** Whether the current user is following the comment author */
  isFollowingAuthor?: boolean;
  /** Whether follow action is loading */
  isFollowLoading?: boolean;
  /** Callback when follow button is pressed */
  onFollowPress?: () => void;
  /** Callback when the comment row is pressed (for collapse) */
  onPress?: () => void;
  /** Callback when avatar/username is pressed */
  onAuthorPress?: () => void;
  /** Callback when like is pressed */
  onLikePress?: () => void;
  /** Callback when dislike is pressed */
  onDislikePress?: () => void;
  /** Callback when reply is pressed */
  onReplyPress?: () => void;
  /** Callback when more options is pressed */
  onMorePress?: () => void;
  /** Whether this comment is collapsed */
  isCollapsed?: boolean;
  /** Nesting depth for visual indent */
  depth?: number;
  /** Maximum depth before collapsing visually */
  maxDepth?: number;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
};

const SIZE_CONFIG = {
  iconSize: 18,
  avatarSize: "sm" as const,
};

// Regex to match image URLs (standalone URLs on their own line)
const IMAGE_URL_REGEX = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))$/i;

// Regex to match Cloudflare Images URLs
const CLOUDFLARE_IMAGE_REGEX = /^https?:\/\/imagedelivery\.net\/[^\s]+$/i;

// Regex to match Giphy URLs (handles media.giphy.com, media0-4.giphy.com, i.giphy.com)
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
  const lines = content.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trim();

    if (isImageUrl(trimmedLine)) {
      imageUrls.push(trimmedLine);
    } else {
      textLines.push(line);
    }
  }

  return { text: textLines.join("\n").trim(), imageUrls };
}

/**
 * Component to render an image in comment
 */
const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;

const CommentImage = memo(({
  url,
  onPress,
}: {
  url: string;
  onPress?: (url: string) => void;
}) => {
  const { theme } = useUnistyles();
  const [hasError, setHasError] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const mediaSource = useMemo(() => ({ uri: url }), [url]);

 const MEDIA_MAX_HEIGHT = 450;
  const containerWidth = (SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING) * 0.6;
  const calculatedHeight = containerWidth / aspectRatio;
  const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
  const mediaWrapperStyle = exceedsMaxHeight
    ? { height: MEDIA_MAX_HEIGHT }
    : { aspectRatio };

  if (hasError) {
    return (
      <View
        style={[
          commentImageStyles.errorContainer,
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
    <View style={commentImageStyles.mediaContainer}>
      <Pressable
        style={[commentImageStyles.mediaWrapper, mediaWrapperStyle]}
        onPress={() => {
          if (onPress) {
            triggerHaptic("selection");
            onPress(url);
          }
        }}
      >
        <Image
          source={mediaSource}
          style={commentImageStyles.image}
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
          <View style={commentImageStyles.skeletonOverlay}>
            <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
          </View>
        )}
      </Pressable>
    </View>
  );
});
const commentImageStyles = StyleSheet.create((theme) => ({
  mediaContainer: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
 mediaWrapper: {
    width: "60%",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  errorContainer: {
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
}));

const CommentContent = memo(({ content }: { content: string }) => {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const { text, imageUrls } = useMemo(
    () => extractImageUrls(content),
    [content],
  );

  const handleLinkPress = useCallback((url: string) => {
    triggerHaptic("light");
    openUrlOrInternal(url);
  }, []);

  const handleImagePress = useCallback((url: string) => {
    setPreviewImageUrl(url);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImageUrl(null);
  }, []);

  return (
    <>
      <View style={styles.content}>
        {text.length > 0 && (
          <MarkdownContent content={text} onLinkPress={handleLinkPress} />
        )}

        {imageUrls.map((url, index) => (
          <CommentImage
            key={`img-${index}`}
            url={url}
            onPress={handleImagePress}
          />
        ))}
      </View>

      <MediaPreviewModal
        visible={!!previewImageUrl}
        media={previewImageUrl ? { type: "image", uri: previewImageUrl } : null}
        onClose={handleClosePreview}
      />
    </>
  );
});

export const CommentItem = ({
  comment,
  isOwnComment = false,
  isHighlighted = false,
  isFollowingAuthor = false,
  isFollowLoading = false,
  onFollowPress,
  onPress,
  onAuthorPress,
  onLikePress,
  onDislikePress,
  onReplyPress,
  onMorePress,
  isCollapsed = false,
  depth = 0,
  maxDepth = 4,
  style,
}: CommentItemProps) => {
  const { theme } = useUnistyles();

  const { author, content, likes, hasLiked, hasDisliked, createdAt } = comment;

  const usernameColorStyle = useMemo(() => {
    const tierColor = author.level != null ? getUsernameColor(author.level) : undefined;
    if (tierColor) return { color: tierColor };
    if (author.isNewUser && (!author.level || author.level === 0)) return { color: NEW_USER_COLOR };
    return undefined;
  }, [author.level, author.isNewUser]);

  // Highlight style for navigated-to comment
  const highlightStyle = isHighlighted
    ? { backgroundColor: theme.colors.primary[500] + "20" } // 20% opacity
    : undefined;

  // Animation values for arrow movement (using RN Animated for transform)
  const upArrowTranslateY = useRef(new RNAnimated.Value(0)).current;
  const downArrowTranslateY = useRef(new RNAnimated.Value(0)).current;

  // Animation for collapse/expand
  const animationProgress = useSharedValue(isCollapsed ? 0 : 1);

  useEffect(() => {
    if (isCollapsed) {
      animationProgress.value = withTiming(0, {
        duration: 150,
        easing: Easing.out(Easing.quad),
      });
    } else {
      animationProgress.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [isCollapsed, animationProgress]);

  const animatedContentStyle = useAnimatedStyle(() => {
    const opacity = animationProgress.value;

    return {
      opacity,
      transform: [{ scaleY: animationProgress.value }],
      height: animationProgress.value === 0 ? 0 : "auto",
      overflow: "hidden" as const,
    };
  });

  // Calculate indent based on depth (max out at maxDepth)
  const effectiveDepth = Math.min(depth, maxDepth);
  const indentWidth = effectiveDepth * 16;

  const handlePress = useCallback(() => {
    triggerHaptic("light");
    onPress?.();
  }, [onPress]);

  const handleAuthorPress = useCallback(() => {
    triggerHaptic("selection");
    onAuthorPress?.();
  }, [onAuthorPress]);

  const handleLikePress = useCallback(() => {
    triggerHaptic(hasLiked ? "light" : "medium");

    // Animate arrow movement - bounce up
    RNAnimated.sequence([
      RNAnimated.timing(upArrowTranslateY, {
        toValue: -3,
        duration: 150,
        useNativeDriver: true,
      }),
      RNAnimated.timing(upArrowTranslateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    onLikePress?.();
  }, [hasLiked, onLikePress, upArrowTranslateY]);

  const handleDislikePress = useCallback(() => {
    triggerHaptic(hasDisliked ? "light" : "medium");

    // Animate arrow movement - bounce down
    RNAnimated.sequence([
      RNAnimated.timing(downArrowTranslateY, {
        toValue: 3,
        duration: 150,
        useNativeDriver: true,
      }),
      RNAnimated.timing(downArrowTranslateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    onDislikePress?.();
  }, [hasDisliked, onDislikePress, downArrowTranslateY]);

  const handleReplyPress = useCallback(() => {
    triggerHaptic("selection");
    onReplyPress?.();
  }, [onReplyPress]);

  const handleMorePress = useCallback(() => {
    triggerHaptic("selection");
    onMorePress?.();
  }, [onMorePress]);

  // Format count for display
  const formatCount = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const iconColor = theme.colors.text.subtle;

  // Vote colors persist based on state (same as post-actions)
  const upvoteColor = hasLiked ? UPVOTE_COLOR : iconColor;
  const downvoteColor = hasDisliked ? DOWNVOTE_COLOR : iconColor;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, highlightStyle, style]}
    >
      {/* Thread line for nested comments */}
      {depth > 0 && (
        <View style={[styles.threadLineContainer, { width: indentWidth }]}>
          {Array.from({ length: effectiveDepth }).map((_, i) => (
            <View key={i} style={[styles.threadLine, { left: i * 16 + 8 }]} />
          ))}
        </View>
      )}

      <View style={[styles.contentWrapper, { marginLeft: indentWidth }]}>
        {/* Header: Avatar, Username, Time */}
        <View style={styles.header}>
          <View style={styles.authorSection}>
            <View style={styles.authorInfo}>
              <View style={styles.authorRow}>
                <Pressable
                  onPress={handleAuthorPress}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  style={({ pressed }) => [
                    styles.usernameButton,
                    pressed && styles.usernameButtonPressed,
                  ]}
                >
                  <Text
                    size="md"
                    weight="medium"
                    numberOfLines={1}
                    mode={usernameColorStyle ? undefined : "subtle"}
                    style={usernameColorStyle}
                  >
                    @{author.username}
                  </Text>
                </Pressable>

                <Text size="md" mode="subtle">
                  ·
                </Text>

                <TimeAgo timestamp={createdAt} showSuffix={false} size="md" />
                {isCollapsed && (
                  <Text
                    size="md"
                    mode="subtle"
                    numberOfLines={1}
                    style={styles.collapsedPreview}
                  >
                    {content}
                  </Text>
                )}
              </View>
            </View>
          </View>
          {!isCollapsed && (
            <Pressable onPress={handlePress} style={styles.expandArea} />
          )}
          {!isOwnComment && !isCollapsed && (
            <FollowButton
              isFollowing={isFollowingAuthor}
              onPress={onFollowPress}
              size="sm"
              loading={isFollowLoading}
              disabled={isFollowingAuthor}
            />
          )}
        </View>

        {/* Comment content - collapsible */}
        <Animated.View style={animatedContentStyle}>
          <CommentContent content={content} />

          {comment.awards && comment.awards.length > 0 && (
            <View style={styles.awardBadgesRow}>
              <AwardBadges awards={comment.awards} size="sm" />
            </View>
          )}

          {/* Actions below content on the right */}
          <View style={styles.actionsRow}>
            <View style={styles.actions}>
              {/* More options (three dots) */}
              <AnimatedPressable
                scaleAmount={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={handleMorePress}
                style={styles.actionButton}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={SIZE_CONFIG.iconSize + 5}
                  color={iconColor}
                />
              </AnimatedPressable>

              {/* Reply */}
              <AnimatedPressable
                scaleAmount={0.85}
                onPress={handleReplyPress}
                style={styles.actionButton}
                hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }}
              >
                <Octicons
                  name="reply"
                  size={
                    depth === 0
                      ? SIZE_CONFIG.iconSize
                      : SIZE_CONFIG.iconSize + 4
                  }
                  color={iconColor}
                />
                {depth === 0 && (
                  <Text
                    size="sm"
                    mode="subtle"
                    weight="bold"
                    style={styles.actionText}
                  >
                    Reply
                  </Text>
                )}
              </AnimatedPressable>

              {/* Vote group: upvote + count + downvote */}
              <View style={styles.voteGroup}>
                <Pressable
                  onPress={handleLikePress}
                  style={styles.voteButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <RNAnimated.View
                    style={{ transform: [{ translateY: upArrowTranslateY }] }}
                  >
                    {hasLiked ? (
                      <UpvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={upvoteColor}
                      />
                    ) : (
                      <UpvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={upvoteColor}
                      />
                    )}
                  </RNAnimated.View>
                </Pressable>

                <Text
                  size="sm"
                  weight="bold"
                  style={{
                    color: hasLiked
                      ? upvoteColor
                      : hasDisliked
                        ? downvoteColor
                        : iconColor,
                  }}
                >
                  {formatCount(likes)}
                </Text>

                <Pressable
                  onPress={handleDislikePress}
                  style={styles.voteButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <RNAnimated.View
                    style={{ transform: [{ translateY: downArrowTranslateY }] }}
                  >
                    {hasDisliked ? (
                      <DownvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={downvoteColor}
                      />
                    ) : (
                      <DownvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={downvoteColor}
                      />
                    )}
                  </RNAnimated.View>
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    paddingBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  threadLineContainer: {
    position: "absolute",
    top: theme.spacing.sm + 2,
    bottom: 0,
    left: theme.spacing.md,
  },
  threadLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: theme.colors.border.subtle,
    borderRadius: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  authorInfo: {
    flexShrink: 0,
  },
  usernameButton: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    flexShrink: 0,
  },
  usernameButtonPressed: {
    opacity: 0.6,
  },
  expandArea: {
    flex: 1,
    height: 32,
  },
  collapsedPreview: {
    flexShrink: 1,
    marginLeft: theme.spacing.xs,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing.xs,
  },
  content: {
    marginTop: theme.spacing.xs,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: theme.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md + 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actionText: {
    marginLeft: 5,
  },
  voteGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  awardBadgesRow: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
}));
