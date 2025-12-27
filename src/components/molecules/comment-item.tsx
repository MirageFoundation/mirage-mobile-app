import { Avatar, TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { useCallback, useEffect } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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

export const CommentItem = ({
  comment,
  isOwnComment = false,
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
      [0, 0.5, 1]
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
    onLikePress?.();
  }, [hasLiked, onLikePress]);

  const handleDislikePress = useCallback(() => {
    triggerHaptic(hasDisliked ? "light" : "medium");
    onDislikePress?.();
  }, [hasDisliked, onDislikePress]);

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

  return (
    <Pressable onPress={handlePress} style={[styles.container, style]}>
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
          <Pressable onPress={handleAuthorPress} style={styles.authorSection}>
            <Avatar
              size={SIZE_CONFIG.avatarSize}
              seed={author.avatarSeed ?? author.username}
              source={author.avatarUrl ? { uri: author.avatarUrl } : undefined}
              bordered
            />
            <View style={styles.authorInfo}>
              <View style={styles.authorRow}>
                <Text size="sm" weight="semibold" numberOfLines={1}>
                  @{author.username}
                </Text>
                <Text size="xs" mode="subtle">
                  ·
                </Text>
                <TimeAgo timestamp={createdAt} showSuffix={false} size="xs" />
              </View>
            </View>
          </Pressable>
          {/* Tappable area to expand/collapse */}
          <Pressable onPress={handlePress} style={styles.expandArea} />
        </View>

        {/* Comment content - collapsible */}
        <Animated.View style={animatedContentStyle}>
          <Text size="sm" style={styles.content}>
            {content}
          </Text>

          {/* Actions below content on the right */}
          <View style={styles.actionsRow}>
            <View style={styles.actions}>
              {/* More options (three dots) */}
              <Pressable onPress={handleMorePress} style={styles.actionButton}>
                <Ionicons
                  name="ellipsis-horizontal"
                  size={SIZE_CONFIG.iconSize}
                  color={iconColor}
                />
              </Pressable>

              {/* Reply */}
              <Pressable onPress={handleReplyPress} style={styles.actionButton}>
                <Octicons
                  name="reply"
                  size={SIZE_CONFIG.iconSize - 1}
                  color={iconColor}
                />
                {depth === 0 && (
                  <Text size="xs" mode="subtle" style={styles.actionText}>
                    Reply
                  </Text>
                )}
              </Pressable>

              {/* Like */}
              <Pressable onPress={handleLikePress} style={styles.actionButton}>
                <Ionicons
                  name="arrow-up"
                  size={SIZE_CONFIG.iconSize}
                  color={hasLiked ? theme.colors.success[500] : iconColor}
                />
                {likes > 0 && (
                  <Text
                    size="xs"
                    style={[
                      styles.actionText,
                      {
                        color: hasLiked
                          ? theme.colors.success[500]
                          : theme.colors.text.subtle,
                      },
                    ]}
                  >
                    {formatCount(likes)}
                  </Text>
                )}
              </Pressable>

              {/* Dislike */}
              <Pressable
                onPress={handleDislikePress}
                style={styles.actionButton}
              >
                <Ionicons
                  name="arrow-down"
                  size={SIZE_CONFIG.iconSize}
                  color={hasDisliked ? theme.colors.error[500] : iconColor}
                />
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
  authorInfo: {
    marginLeft: theme.spacing.xs,
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
    gap: theme.spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actionText: {
    marginLeft: 3,
  },
}));
