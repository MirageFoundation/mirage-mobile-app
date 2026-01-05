import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  AntDesign,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useRef } from "react";
import {
  Animated,
  Pressable,
  Share,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
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
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <Animated.View
            style={{
              transform: [{ translateY: upArrowTranslateY }],
            }}
          >
            <AntDesign
              name="arrow-up"
              size={iconSize}
              color={upvoteColor}
            />
          </Animated.View>
          <Text
            size={voteTextSize}
            weight={hasLiked ? "semibold" : "regular"}
            style={{ marginLeft: 3, color: upvoteColor }}
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
          <Animated.View
            style={{
              transform: [{ translateY: downArrowTranslateY }],
            }}
          >
            <AntDesign
              name="arrow-down"
              size={iconSize}
              color={downvoteColor}
            />
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
          style={[styles.voteButton, disabled && styles.disabled]}
        >
          <MaterialCommunityIcons
            name="comment-outline"
            size={iconSize}
            color={defaultColor}
          />
          <Text size={voteTextSize} style={{ marginLeft: 3, color: defaultColor }}>
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
          <Ionicons name="share-outline" size={iconSize} color={defaultColor} />
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
