import {
  DownvoteFilledIcon,
  DownvoteOutlineIcon,
  UpvoteFilledIcon,
  UpvoteOutlineIcon,
} from "@/assets/figma-icons";
import { TimeAgo, FollowButton } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { MediaPreviewModal } from "./media-preview-modal";
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
  iconSize: 16,
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
const CommentImage = ({ url, onPress }: { url: string; onPress?: () => void }) => {
const { theme } = useUnistyles();
const [hasError, setHasError] = useState(false);
 const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const MEDIA_MAX_HEIGHT = 450;
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
  <Pressable 
      style={[commentImageStyles.container, containerStyle]}
    onPress={() => {
       if (onPress) {
         triggerHaptic("selection");
         onPress();
       }
     }}
   >
    <Image
      source={{ uri: url }}
      style={commentImageStyles.image}
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
const commentImageStyles = StyleSheet.create((theme) => ({
container: {
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

const CommentContent = ({ content }: { content: string }) => {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

 const { text, imageUrls } = useMemo(
   () => extractImageUrls(content),
   [content],
 );

 const handleLinkPress = useCallback((url: string) => {
   triggerHaptic("light");
   const fullUrl =
     url.startsWith("http://") || url.startsWith("https://")
       ? url
       : `https://${url}`;
   Linking.openURL(fullUrl).catch(() => {});
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
            onPress={() => handleImagePress(url)}
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
};

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
                  <Text
                    size="md"
                    weight="medium"
                    numberOfLines={1}
                    mode="subtle"
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
                    size="xs"
                   mode="subtle"
                   weight="semibold"
                   style={styles.actionText}
                 >
                   Reply
                 </Text>
               )}
              </AnimatedPressable>

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
                style={[styles.actionButton, { marginRight: 8 }]}
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
    flex: 1,
  },
 authorInfo: {
   flex: 1,
 },
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
  collapsedPreview: {
    flexShrink: 1,
    marginLeft: theme.spacing.xs,
  },
 authorRow: {
   flexDirection: "row",
   alignItems: "center",
    flex: 1,
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
    gap: theme.spacing.md + 2,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actionText: {
    marginLeft: 5,
  },
}));
