import { VoteButton } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
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
  sm: { iconSize: 16, gap: 12, textSize: "xs" as const },
  md: { iconSize: 20, gap: 16, textSize: "sm" as const },
  lg: { iconSize: 24, gap: 20, textSize: "md" as const },
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
  const { iconSize, gap, textSize } = SIZE_CONFIG[size];

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

  return (
    <View style={[styles.container, { gap }, style]}>
      {/* Vote buttons section */}
      <View style={[styles.voteSection, { gap: gap / 2 }]}>
        <VoteButton
          type="like"
          count={likes}
          isActive={hasLiked}
          onPress={onLikePress}
          size={size}
          disabled={disabled}
        />
        <VoteButton
          type="dislike"
          count={dislikes}
          isActive={hasDisliked}
          onPress={onDislikePress}
          size={size}
          disabled={disabled}
        />
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Comment button */}
      <Pressable
        onPress={() => {
          if (disabled) return;
          triggerHaptic("selection");
          onCommentPress?.();
        }}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.actionButton, disabled && styles.disabled]}
      >
        <Ionicons
          name="chatbubble-outline"
          size={iconSize}
          color={theme.colors.text.subtle}
        />
        <Text size={textSize} mode="subtle" style={{ marginLeft: 4 }}>
          {formatCount(comments)}
        </Text>
      </Pressable>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Share button */}
      <Pressable
        onPress={handleShare}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.actionButton, disabled && styles.disabled]}
      >
        <Ionicons
          name="share-outline"
          size={iconSize}
          color={theme.colors.text.subtle}
        />
        <Text size={textSize} mode="subtle" style={{ marginLeft: 4 }}>
          Share
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  voteSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: theme.colors.border.subtle,
    opacity: 0.5,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.5,
  },
}));
