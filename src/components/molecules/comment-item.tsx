import {
  DownvoteFilledIcon,
  DownvoteOutlineIcon,
  UpvoteFilledIcon,
  UpvoteOutlineIcon,
} from "@/assets/figma-icons";
import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Animated as RNAnimated,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Link color for clickable links
const LINK_COLOR = "#3B82F6"; // Blue shade

// Vote colors (same as post-actions)
const UPVOTE_COLOR = "#FF4757"; // Red shade for upvote
const DOWNVOTE_COLOR = "#8B5CF6"; // Purple shade for downvote

export type CommentAuthor = {
  id: string;
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
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
};

type CommentItemProps = {
  /** Comment data */
  comment: Comment;
  /** Whether the current user is the author */
  isOwnComment?: boolean;
  /** Whether this comment is highlighted (navigated to from profile) */
  isHighlighted?: boolean;
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
  iconSize: 16,
  avatarSize: "sm" as const,
};

// Regex to match markdown links: [text](url)
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

// Regex to match image URLs (standalone URLs on their own line)
const IMAGE_URL_REGEX = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))$/i;

// Regex to match Cloudflare Images URLs
const CLOUDFLARE_IMAGE_REGEX = /^https?:\/\/imagedelivery\.net\/[^\s]+$/i;

// Regex to match Giphy URLs (handles media.giphy.com, media0-4.giphy.com, i.giphy.com)
const GIPHY_URL_REGEX =
  /^https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+$/i;

type ContentPart =
  | { type: "text"; content: string }
  | { type: "link"; text: string; url: string }
  | { type: "image"; url: string };

/**
 * Check if a URL is an image URL
 */
function isImageUrl(url: string): boolean {
  return (
    IMAGE_URL_REGEX.test(url) ||
    CLOUDFLARE_IMAGE_REGEX.test(url) ||
    GIPHY_URL_REGEX.test(url)
  );
}

/**
 * Parse content and extract markdown links and images
 */
function parseContentWithLinks(content: string): ContentPart[] {
  const parts: ContentPart[] = [];

  // First, split by newlines to handle standalone image URLs
  const lines = content.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trim();

    // Check if this line is a standalone image URL
    if (isImageUrl(trimmedLine)) {
      parts.push({ type: "image", url: trimmedLine });
      continue;
    }

    // Otherwise, parse for markdown links
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Reset regex state
    MARKDOWN_LINK_REGEX.lastIndex = 0;

    let hasContent = false;

    while ((match = MARKDOWN_LINK_REGEX.exec(line)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        const textBefore = line.slice(lastIndex, match.index);
        if (textBefore) {
          parts.push({ type: "text", content: textBefore });
          hasContent = true;
        }
      }

      // Add the link
      parts.push({
        type: "link",
        text: match[1],
        url: match[2],
      });
      hasContent = true;

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after the last link
    if (lastIndex < line.length) {
      const remaining = line.slice(lastIndex);
      if (remaining) {
        parts.push({ type: "text", content: remaining });
        hasContent = true;
      }
    }

    // Add newline between lines (except for the last line)
    if (lineIndex < lines.length - 1 && hasContent) {
      parts.push({ type: "text", content: "\n" });
    }
  }

  return parts;
}

/**
 * Component to render an image in comment
 */
const CommentImage = ({ url }: { url: string }) => {
  const { theme } = useUnistyles();
  const [hasError, setHasError] = useState(false);

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
    <View style={commentImageStyles.container}>
      <Image
        source={{ uri: url }}
        style={commentImageStyles.image}
        contentFit="cover"
        transition={200}
        onError={() => setHasError(true)}
      />
    </View>
  );
};

const commentImageStyles = StyleSheet.create((theme) => ({
  container: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 200,
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
}));

/**
 * Component to render content with clickable links and images
 */
const CommentContent = ({ content }: { content: string }) => {
  const parts = useMemo(() => parseContentWithLinks(content), [content]);

  const handleLinkPress = useCallback((url: string) => {
    triggerHaptic("light");
    // Ensure URL has protocol
    const fullUrl =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://${url}`;
    Linking.openURL(fullUrl).catch((err) => {
      console.error("Failed to open URL:", err);
    });
  }, []);

  // Check if we have any images
  const hasImages = parts.some((part) => part.type === "image");

  // If no links and no images, render simple text
  if (parts.length === 1 && parts[0].type === "text") {
    return (
      <Text size="md" style={styles.content}>
        {content}
      </Text>
    );
  }

  // Separate text/link parts from image parts for proper rendering
  const textParts: ContentPart[] = [];
  const imageParts: ContentPart[] = [];

  for (const part of parts) {
    if (part.type === "image") {
      imageParts.push(part);
    } else {
      textParts.push(part);
    }
  }

  return (
    <View>
      {/* Text content */}
      {textParts.length > 0 && (
        <Text size="md" style={styles.content}>
          {textParts.map((part, index) => {
            if (part.type === "text") {
              return part.content;
            }
            if (part.type === "link") {
              return (
                <Text
                  key={index}
                  size="md"
                  style={{ color: LINK_COLOR }}
                  onPress={() => handleLinkPress(part.url)}
                >
                  {part.text}
                </Text>
              );
            }
            return null;
          })}
        </Text>
      )}

      {/* Images */}
      {imageParts.map(
        (part, index) =>
          part.type === "image" && (
            <CommentImage key={`img-${index}`} url={part.url} />
          ),
      )}
    </View>
  );
};

export const CommentItem = ({
  comment,
  isOwnComment = false,
  isHighlighted = false,
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
      // Collapse: quick timing
      animationProgress.value = withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      // Expand: spring for bounce
      animationProgress.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
        mass: 0.5,
      });
    }
  }, [isCollapsed, animationProgress]);

  const animatedContentStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animationProgress.value,
      [0, 0.5, 1],
      [0, 0.5, 1],
    );
    const translateY = interpolate(animationProgress.value, [0, 1], [-8, 0]);
    const scale = interpolate(animationProgress.value, [0, 1], [0.97, 1]);
    const maxHeight = interpolate(animationProgress.value, [0, 1], [0, 500]);

    return {
      opacity,
      transform: [{ translateY }, { scale }],
      maxHeight: animationProgress.value === 0 ? 0 : maxHeight,
      overflow: "hidden",
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
                  <Text size="sm" weight="bold" numberOfLines={1} mode="subtle">
                    @{author.username}
                  </Text>
                </Pressable>

                <Text size="sm" mode="subtle">
                  ·
                </Text>

                <TimeAgo timestamp={createdAt} showSuffix={false} size="xs" />
              </View>
            </View>
          </View>
          {/* Tappable area to expand/collapse */}
          <Pressable onPress={handlePress} style={styles.expandArea} />
        </View>

        {/* Comment content - collapsible */}
        <Animated.View style={animatedContentStyle}>
          <CommentContent content={content} />

          {/* Actions below content on the right */}
          <View style={styles.actionsRow}>
            <View style={styles.actions}>
              {/* More options (three dots) */}
              <Pressable
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={handleMorePress}
                style={styles.actionButton}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={SIZE_CONFIG.iconSize + 5}
                  color={iconColor}
                />
              </Pressable>

              {/* Reply */}
              <Pressable
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
                    size={theme.typography.size.xs}
                    mode="subtle"
                    weight="semibold"
                    style={styles.actionText}
                  >
                    Reply
                  </Text>
                )}
              </Pressable>

              {/* Like */}
              <Pressable
                onPress={handleLikePress}
                style={styles.actionButton}
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
                    <UpvoteOutlineIcon
                      size={SIZE_CONFIG.iconSize}
                      color={upvoteColor}
                    />
                  )}
                </RNAnimated.View>
                {likes > 0 && (
                  <Text
                    size="xs"
                    weight="bold"
                    style={[styles.actionText, { color: upvoteColor }]}
                  >
                    {formatCount(likes)}
                  </Text>
                )}
              </Pressable>

              {/* Dislike */}
              <Pressable
                onPress={handleDislikePress}
                style={styles.actionButton}
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
                    <DownvoteOutlineIcon
                      size={SIZE_CONFIG.iconSize}
                      color={downvoteColor}
                    />
                  )}
                </RNAnimated.View>
              </Pressable>
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
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  threadLineContainer: {
    position: "absolute",
    top: 0,
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
  },
  authorInfo: {},
  usernameButton: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  usernameButtonPressed: {
    opacity: 0.6,
  },
  expandArea: {
    flex: 1,
    height: 32,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
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
    gap: theme.spacing.lg,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actionText: {
    marginLeft: 8,
  },
}));
