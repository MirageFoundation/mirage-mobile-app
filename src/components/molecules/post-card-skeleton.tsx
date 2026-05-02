import { useEffect } from "react";
import { Dimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SHIMMER_WIDTH = SCREEN_WIDTH * 0.7;

type PostCardSkeletonProps = {
  showMedia?: boolean;
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
  const translateX = useSharedValue(-SHIMMER_WIDTH);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(SCREEN_WIDTH, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [translateX]);

  const shimmerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={[
        {
          width,
          height,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: borderRadius ?? theme.radius.sm,
          overflow: "hidden",
          opacity: 0.5,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            width: SHIMMER_WIDTH,
            height: "100%",
            position: "absolute",
          },
          shimmerAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.15)", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ width: "100%", height: "100%" }}
        />
      </Animated.View>
    </View>
  );
};

export const PostCardSkeleton = ({
  showMedia = true,
  showBody = true,
}: PostCardSkeletonProps) => {
  const { theme } = useUnistyles();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.authorSection}>
          <View style={styles.authorInfo}>
            <SkeletonBox width={100} height={14} />
          </View>
        </View>
        <SkeletonBox width={70} height={28} borderRadius={theme.radius.full} />
      </View>

      <View style={styles.titleContainer}>
        <SkeletonBox width="100%" height={18} style={{ marginBottom: 6 }} />
        <SkeletonBox width="75%" height={18} />
      </View>

      {showMedia && (
        <View style={styles.mediaContainer}>
          <SkeletonBox
            width="100%"
            height={200}
            borderRadius={theme.radius.md}
          />
        </View>
      )}

      {showBody && !showMedia && (
        <View style={styles.bodyContainer}>
          <SkeletonBox width="100%" height={14} style={{ marginBottom: 4 }} />
          <SkeletonBox width="90%" height={14} />
        </View>
      )}

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

export const PostCardSkeletonList = ({ count = 5 }: { count?: number }) => {
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
