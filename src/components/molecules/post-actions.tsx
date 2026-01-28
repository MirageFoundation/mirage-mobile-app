import {
  CommentIcon,
  DownvoteFilledIcon,
  DownvoteOutlineIcon,
  ShareIcon,
  UpvoteFilledIcon,
  UpvoteOutlineIcon,
} from "@/assets/figma-icons";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useRef } from "react";
import {
  Animated,
  Pressable,
  Share,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Vote colors
const UPVOTE_COLOR = "#FF4757"; // Red shade for upvote
const DOWNVOTE_COLOR = "#8B5CF6"; // Purple shade for downvote

type PostActionsProps = {
  /** Number of likes */
  likes: number;
  /** Number of dislikes */
  dislikes: number;
  /** Number of comments */
  comments: number;
  /** Whether current user has liked */
  hasLiked?: boolean;
  /** Whether current user has disliked */
  hasDisliked?: boolean;
  /** Callback when like is pressed */
  onLikePress?: () => void;
  /** Callback when dislike is pressed */
  onDislikePress?: () => void;
  /** Callback when comment is pressed */
  onCommentPress?: () => void;
  /** Callback when share is pressed */
  onSharePress?: () => void;
  /** URL to share (for native share) */
  shareUrl?: string;
  /** Title to share (for native share) */
  shareTitle?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Disabled state */
  disabled?: boolean;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
  /** Whether this is the current user's own post */
  isOwnPost?: boolean;
  /** Author username for moderation menu */
  authorUsername?: string;
  /** Callback when block user is pressed */
  onBlockUser?: () => void;
  /** Callback when block post is pressed */
  onBlockPost?: () => void;
  /** Callback when report is pressed */
  onReport?: () => void;
};

const SIZE_CONFIG = {
  sm: {
    iconSize: 12,
    gap: 10,
    textSize: "xs" as const,
    pillHeight: 24,
    voteTextSize: "xs" as const,
  },
  md: {
    iconSize: 16,
    gap: 14,
    textSize: "sm" as const,
    pillHeight: 30,
    voteTextSize: "sm" as const,
  },
  lg: {
    iconSize: 18,
    gap: 18,
    textSize: "sm" as const,
    pillHeight: 32,
    voteTextSize: "sm" as const,
  },
};

export const PostActions = memo(function PostActions({
  likes,
  dislikes,
  comments,
  hasLiked = false,
  hasDisliked = false,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onSharePress,
  shareUrl,
  shareTitle,
  size = "md",
  disabled = false,
  style,
  isOwnPost = false,
  authorUsername,
  onBlockUser,
  onBlockPost,
  onReport,
}: PostActionsProps) {
  const { theme } = useUnistyles();
  const { iconSize, gap, pillHeight, voteTextSize } = SIZE_CONFIG[size];

  // Animation values for arrow movement
  const upArrowTranslateY = useRef(new Animated.Value(0)).current;
  const downArrowTranslateY = useRef(new Animated.Value(0)).current;

  const handleLikePress = () => {
    if (disabled) return;
    triggerHaptic(hasLiked ? "light" : "medium");

    // Animate arrow movement - bounce up
    Animated.sequence([
      Animated.timing(upArrowTranslateY, {
        toValue: -4,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(upArrowTranslateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    onLikePress?.();
  };

  const handleDislikePress = () => {
    if (disabled) return;
    triggerHaptic(hasDisliked ? "light" : "medium");

    // Animate arrow movement - bounce down
    Animated.sequence([
      Animated.timing(downArrowTranslateY, {
        toValue: 4,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(downArrowTranslateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    onDislikePress?.();
  };

  const handleShare = async () => {
    triggerHaptic("light", disabled);

    if (onSharePress) {
      onSharePress();
      return;
    }

    // Default native share behavior
    if (shareUrl) {
      try {
        await Share.share({
          message: shareTitle ? `${shareTitle}\n${shareUrl}` : shareUrl,
          url: shareUrl,
          title: shareTitle,
        });
      } catch {
        // User cancelled or share failed - silent fail
      }
    }
  };

  const handleBlockUser = () => {
    triggerHaptic("warning");
    onBlockUser?.();
  };

  const handleBlockPost = () => {
    triggerHaptic("warning");
    onBlockPost?.();
  };

  const handleReport = () => {
    triggerHaptic("warning");
    onReport?.();
  };

  // Format count for display (e.g., 1234 -> 1.2K)
  const formatCount = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const defaultColor = theme.colors.text.default;

  // Colors persist based on vote state
  // When upvoted: both arrow and count are red
  // When downvoted: both arrow and count are purple
  // When neutral: default color
  const upvoteColor = hasLiked ? UPVOTE_COLOR : defaultColor;
  const downvoteColor = hasDisliked ? DOWNVOTE_COLOR : defaultColor;

  return (
    <View style={[styles.container, { gap }, style]}>
      {/* Vote pill container */}
      <View style={[styles.votePill, { height: pillHeight }]}>
        {/* Like button */}
        <Pressable
          onPress={handleLikePress}
          disabled={disabled}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <Animated.View
            style={{
              transform: [{ translateY: upArrowTranslateY }],
            }}
          >
            {hasLiked ? (
              <UpvoteFilledIcon size={iconSize} color={upvoteColor} />
            ) : (
              <UpvoteOutlineIcon size={iconSize} color={upvoteColor} />
            )}
          </Animated.View>
          <Text
            size={voteTextSize}
            weight="bold"
            style={{ marginLeft: 14, color: upvoteColor }}
          >
            {formatCount(likes)}
          </Text>
        </Pressable>

        {/* Divider */}
        <View style={styles.voteDivider} />

        {/* Dislike button */}
        <Pressable
          onPress={handleDislikePress}
          disabled={disabled}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <Animated.View
            style={{
              transform: [{ translateY: downArrowTranslateY }],
            }}
          >
            {hasDisliked ? (
              <DownvoteFilledIcon size={iconSize} color={downvoteColor} />
            ) : (
              <DownvoteOutlineIcon size={iconSize} color={downvoteColor} />
            )}
          </Animated.View>
        </Pressable>
      </View>

      {/* Comment pill container */}
      <View style={[styles.votePill, { height: pillHeight }]}>
        <Pressable
          onPress={() => {
            if (disabled) return;
            triggerHaptic("selection");
            onCommentPress?.();
          }}
          disabled={disabled}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <CommentIcon size={iconSize} color={defaultColor} />
          <Text
            size={voteTextSize}
            weight="bold"
            style={{ marginLeft: 10, color: defaultColor }}
          >
            {formatCount(comments)}
          </Text>
        </Pressable>
      </View>

      {/* Spacer to push share to the right */}
      <View style={styles.spacer} />

      {/* Share pill container */}
      <View style={[styles.votePill, { height: pillHeight }]}>
        <Pressable
          onPress={handleShare}
          disabled={disabled}
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <ShareIcon size={iconSize} color={defaultColor} />
        </Pressable>
      </View>

      {/* Moderation menu (only for other users' posts) */}
      {!isOwnPost && (
        <Menu>
          <MenuTrigger
            customStyles={{
              triggerOuterWrapper: { marginLeft: -3 },
              triggerTouchable: {
                hitSlop: { top: 6, bottom: 6, left: 6, right: 6 },
              },
            }}
          >
            <View style={[styles.votePill, { height: pillHeight }]}>
              <View style={[styles.voteButton, disabled && styles.disabled]}>
                <Ionicons
                  name="flag-outline"
                  size={iconSize}
                  color={theme.colors.error[500]}
                />
              </View>
            </View>
          </MenuTrigger>
          <MenuOptions
            customStyles={{
              optionsContainer: {
                backgroundColor: theme.colors.background.default,
                borderRadius: theme.radius.lg,
                minWidth: 180,
                shadowColor: theme.colors.contrast.base,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
                borderWidth: 1,
                borderColor: theme.colors.border.subtle,
                marginTop: 4,
                paddingVertical: 8,
              },
            }}
          >
            <MenuOption onSelect={handleBlockUser}>
              <View style={styles.menuOption}>
                <Ionicons
                  name="ban-outline"
                  size={16}
                  color={theme.colors.error[500]}
                />
                <Text
                  size="sm"
                  weight="medium"
                  style={{ color: theme.colors.error[500] }}
                >
                  Block @{authorUsername}
                </Text>
              </View>
            </MenuOption>
            <MenuOption onSelect={handleBlockPost}>
              <View style={styles.menuOption}>
                <Ionicons
                  name="eye-off-outline"
                  size={16}
                  color={theme.colors.error[500]}
                />
                <Text
                  size="sm"
                  weight="medium"
                  style={{ color: theme.colors.error[500] }}
                >
                  Block Post
                </Text>
              </View>
            </MenuOption>
            <MenuOption onSelect={handleReport}>
              <View style={styles.menuOption}>
                <Ionicons
                  name="flag-outline"
                  size={16}
                  color={theme.colors.error[500]}
                />
                <Text
                  size="sm"
                  weight="medium"
                  style={{ color: theme.colors.error[500] }}
                >
                  Report Post
                </Text>
              </View>
            </MenuOption>
          </MenuOptions>
        </Menu>
      )}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  votePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: theme.radius.full,
    borderWidth: 0.5,
    borderColor: theme.colors.border.default,
    paddingHorizontal: 2,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  voteDivider: {
    width: 1,
    height: "60%",
    backgroundColor: theme.colors.border.default,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  spacer: {
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
  },
}));
