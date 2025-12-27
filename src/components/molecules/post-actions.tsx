import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  AntDesign,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import {
  Pressable,
  Share,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
    iconSize: 14,
    gap: 14,
    textSize: "xs" as const,
    pillHeight: 26,
    voteTextSize: "xs" as const,
  },
  lg: {
    iconSize: 18,
    gap: 18,
    textSize: "sm" as const,
    pillHeight: 32,
    voteTextSize: "sm" as const,
  },
};

export const PostActions = ({
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
}: PostActionsProps) => {
  const { theme } = useUnistyles();
  const { iconSize, gap, pillHeight, voteTextSize } = SIZE_CONFIG[size];

  const handleLikePress = () => {
    if (disabled) return;
    triggerHaptic(hasLiked ? "light" : "medium");
    onLikePress?.();
  };

  const handleDislikePress = () => {
    if (disabled) return;
    triggerHaptic(hasDisliked ? "light" : "medium");
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

  const iconColor = theme.colors.text.default;
  const textColor = theme.colors.text.default;

  return (
    <View style={[styles.container, { gap }, style]}>
      {/* Vote pill container */}
      <View style={[styles.votePill, { height: pillHeight }]}>
        {/* Like button */}
        <Pressable
          onPress={handleLikePress}
          disabled={disabled}
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <AntDesign name="arrow-up" size={iconSize} color={iconColor} />
          <Text
            size={voteTextSize}
            weight={hasLiked ? "semibold" : "regular"}
            style={{ marginLeft: 3, color: textColor }}
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
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <AntDesign name="arrow-down" size={iconSize} color={iconColor} />
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
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <MaterialCommunityIcons
            name="comment-outline"
            size={iconSize}
            color={iconColor}
          />
          <Text size={voteTextSize} style={{ marginLeft: 3, color: textColor }}>
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
          <Ionicons name="share-outline" size={iconSize} color={iconColor} />
        </Pressable>
      </View>
    </View>
  );
};

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
    paddingHorizontal: 8,
    paddingVertical: 4,
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
}));
