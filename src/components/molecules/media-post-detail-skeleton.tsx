import { useEffect } from "react";
import { Dimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SHIMMER_WIDTH = SCREEN_WIDTH * 0.7;

const SkeletonBox = ({
  width,
  height,
  style,
  borderRadius,
}: {
  width: number | `${number}%`;
  height: number | `${number}%`;
  style?: object;
  borderRadius?: number;
}) => {
  const { theme } = useUnistyles();
  const translateX = useSharedValue(-SHIMMER_WIDTH);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(SCREEN_WIDTH, {
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
      }),
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

type MediaPostDetailSkeletonProps = {
  embedded?: boolean;
  showHeader?: boolean;
};

export const MediaPostDetailSkeleton = ({
  embedded = false,
  showHeader = true,
}: MediaPostDetailSkeletonProps = {}) => {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const mediaHeight = Math.min(SCREEN_WIDTH * 0.55, 260);

  return (
    <View
      style={[
        styles.container,
        embedded && styles.embeddedContainer,
        {
          paddingTop: showHeader ? insets.top : 0,
          paddingBottom: embedded ? 0 : insets.bottom,
        },
      ]}
    >
      {/* Header */}
      {showHeader && (
        <View style={styles.header}>
          <SkeletonBox width={32} height={32} borderRadius={theme.radius.full} />
          <SkeletonBox
            width={120}
            height={28}
            borderRadius={theme.radius.full}
          />
          <SkeletonBox width={32} height={32} borderRadius={theme.radius.full} />
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.authorRow}>
          <SkeletonBox
            width={32}
            height={32}
            borderRadius={theme.radius.full}
          />
          <SkeletonBox width={140} height={14} style={{ marginLeft: 10 }} />
        </View>

        <View style={styles.titleBlock}>
          <SkeletonBox
            width="90%"
            height={18}
            style={{ marginBottom: 8 }}
          />
          <SkeletonBox width="70%" height={18} />
        </View>

        <SkeletonBox width="100%" height={mediaHeight} borderRadius={theme.radius.md} />

        <View style={styles.actionsRow}>
          <View style={styles.actionGroup}>
            <SkeletonBox width={60} height={28} borderRadius={14} />
            <SkeletonBox width={60} height={28} borderRadius={14} />
            <SkeletonBox width={60} height={28} borderRadius={14} />
          </View>
          <SkeletonBox width={28} height={28} borderRadius={14} />
        </View>
        <View style={styles.bodyBlock}>
          <SkeletonBox width="100%" height={12} style={{ marginBottom: 6 }} />
          <SkeletonBox width="85%" height={12} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.base,
  },
  embeddedContainer: {
    flex: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleBlock: {},
  bodyBlock: {},
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing.xs,
  },
  actionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
}));
