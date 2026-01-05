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

type PostCardSkeletonProps = {
  /** Whether to show the media placeholder */
  showMedia?: boolean;
  /** Whether to show the body text placeholder */
  showBody?: boolean;
};

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

export const PostCardSkeleton = ({
  showMedia = true,
  showBody = true,
}: PostCardSkeletonProps) => {
  const { theme } = useUnistyles();

  return (
    <View style={styles.container}>
      {/* Header: Avatar, Username, Time, Follow, More */}
      <View style={styles.header}>
        <View style={styles.authorSection}>
          {/* Avatar */}
          <SkeletonBox width={36} height={36} borderRadius={18} />
          {/* Username and time */}
          <View style={styles.authorInfo}>
            <SkeletonBox width={100} height={14} />
          </View>
        </View>
        {/* Follow button placeholder */}
        <SkeletonBox width={70} height={28} borderRadius={theme.radius.full} />
      </View>

      {/* Title - 2 lines */}
      <View style={styles.titleContainer}>
        <SkeletonBox width="100%" height={18} style={{ marginBottom: 6 }} />
        <SkeletonBox width="75%" height={18} />
      </View>

      {/* Media placeholder */}
      {showMedia && (
        <View style={styles.mediaContainer}>
          <SkeletonBox
            width="100%"
            height={200}
            borderRadius={theme.radius.md}
          />
        </View>
      )}

      {/* Body text - 2 lines */}
      {showBody && !showMedia && (
        <View style={styles.bodyContainer}>
          <SkeletonBox width="100%" height={14} style={{ marginBottom: 4 }} />
          <SkeletonBox width="90%" height={14} />
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.actionGroup}>
          <SkeletonBox width={50} height={24} borderRadius={12} />
          <SkeletonBox width={50} height={24} borderRadius={12} />
          <SkeletonBox width={50} height={24} borderRadius={12} />
        </View>
        <SkeletonBox width={24} height={24} borderRadius={12} />
      </View>
    </View>
  );
};

/**
 * Multiple skeleton cards for loading state
 */
export const PostCardSkeletonList = ({ count = 5 }: { count?: number }) => {
  // Alternate between different skeleton layouts for variety
  const patterns = [
    { showMedia: true, showBody: false },
    { showMedia: false, showBody: true },
    { showMedia: true, showBody: false },
    { showMedia: false, showBody: true },
    { showMedia: true, showBody: false },
  ];

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <PostCardSkeleton
          key={index}
          showMedia={patterns[index % patterns.length].showMedia}
          showBody={patterns[index % patterns.length].showBody}
        />
      ))}
    </>
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
  titleContainer: {
    marginTop: theme.spacing.sm,
  },
  mediaContainer: {
    marginTop: theme.spacing.sm,
  },
  bodyContainer: {
    marginTop: theme.spacing.xs,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing.sm,
  },
  actionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
}));
