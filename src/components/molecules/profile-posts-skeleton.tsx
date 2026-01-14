import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type SkeletonType = "submissions" | "comments";

interface ProfilePostsSkeletonProps {
  count?: number;
  type?: SkeletonType;
}

const SkeletonBox = ({
  width,
  height,
  style,
  borderRadius,
}: {
  width: number | `${number}%`;
  height: number;
  style?: object;
  borderRadius?: number;
}) => {
  const { theme } = useUnistyles();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: borderRadius ?? theme.radius.sm,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

/**
 * Skeleton for a single post item in profile
 */
const ProfilePostItemSkeleton = ({ showThumbnail = true }: { showThumbnail?: boolean }) => {
  const { theme } = useUnistyles();

  return (
    <View style={styles.postContainer}>
      <View style={styles.postContent}>
        {/* Header: Topic and time */}
        <View style={styles.postHeader}>
          <SkeletonBox width={60} height={18} borderRadius={theme.radius.sm} />
          <SkeletonBox width={40} height={12} />
        </View>

        {/* Title - 2 lines */}
        <View style={styles.titleContainer}>
          <SkeletonBox width="100%" height={16} style={{ marginBottom: 6 }} />
          <SkeletonBox width="70%" height={16} />
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <SkeletonBox width={40} height={14} />
          <SkeletonBox width={40} height={14} />
        </View>
      </View>

      {/* Thumbnail */}
      {showThumbnail && (
        <SkeletonBox width={80} height={80} borderRadius={theme.radius.md} />
      )}
    </View>
  );
};

/**
 * Skeleton for a single comment item in profile
 */
const ProfileCommentItemSkeleton = () => {
  const { theme } = useUnistyles();

  return (
    <View style={styles.commentContainer}>
      {/* Context row */}
      <View style={styles.contextRow}>
        <SkeletonBox width={14} height={14} />
        <SkeletonBox width="60%" height={12} />
        <SkeletonBox width={40} height={12} />
      </View>

      {/* Divider */}
      <View
        style={[styles.divider, { backgroundColor: theme.colors.border.subtle }]}
      />

      {/* Content - 2 lines */}
      <View style={styles.contentContainer}>
        <SkeletonBox width="100%" height={14} style={{ marginBottom: 6 }} />
        <SkeletonBox width="85%" height={14} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <SkeletonBox width={40} height={14} />
      </View>
    </View>
  );
};

/**
 * Multiple skeleton items for loading state
 */
export const ProfilePostsSkeleton = ({
  count = 5,
  type = "submissions",
}: ProfilePostsSkeletonProps) => {
  const { theme } = useUnistyles();

  // Alternate thumbnail visibility for variety
  const patterns = [true, false, true, true, false];

  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index}>
          {type === "submissions" ? (
            <ProfilePostItemSkeleton
              showThumbnail={patterns[index % patterns.length]}
            />
          ) : (
            <ProfileCommentItemSkeleton />
          )}
          {index < count - 1 && (
            <View
              style={[
                styles.separator,
                { backgroundColor: theme.colors.border.subtle },
              ]}
            />
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  // Post skeleton styles
  postContainer: {
    flexDirection: "row",
    backgroundColor: theme.colors.background.default,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  postContent: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.xs,
  },
  titleContainer: {
    marginTop: theme.spacing.xs,
  },

  // Comment skeleton styles
  commentContainer: {
    backgroundColor: theme.colors.background.default,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  divider: {
    height: 1,
    marginVertical: theme.spacing.sm,
  },
  contentContainer: {
    marginTop: theme.spacing.xs,
  },

  // Shared styles
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  separator: {
    height: 1,
  },
}));
