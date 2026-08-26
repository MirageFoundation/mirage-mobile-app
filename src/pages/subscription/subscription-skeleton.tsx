import { useEffect } from "react";
import { ScrollView } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Box } from "@/src/components/ui/primitives";

function SkeletonBox({
  width,
  height,
  style,
  borderRadius,
}: {
  width: number | `${number}%`;
  height: number;
  style?: object;
  borderRadius?: number;
}) {
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
}

export function SubscriptionSkeleton() {
  const { theme } = useUnistyles();

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: theme.spacing.lg, paddingHorizontal: theme.spacing.md }}
      showsVerticalScrollIndicator={false}
    >
      <Box
        rounded="lg"
        p="md"
        mb="lg"
        style={{
          backgroundColor: theme.colors.background.default,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        }}
      >
        <Box direction="row" alignItems="center" gap="sm" mb="md">
          <SkeletonBox width={48} height={48} borderRadius={theme.radius.md} />
          <Box flex gap="xs">
            <SkeletonBox width={80} height={12} />
            <SkeletonBox width={120} height={20} />
          </Box>
        </Box>
        <SkeletonBox width="100%" height={1} style={{ marginBottom: 12 }} />
        <Box direction="row" gap="md">
          <Box flex gap="xs">
            <SkeletonBox width={50} height={12} />
            <SkeletonBox width={80} height={20} />
          </Box>
          <Box flex gap="xs">
            <SkeletonBox width={50} height={12} />
            <SkeletonBox width={80} height={20} />
          </Box>
        </Box>
      </Box>

      <SkeletonBox width={120} height={12} style={{ marginBottom: 12 }} />

      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          rounded="lg"
          p="md"
          mb="md"
          style={{
            backgroundColor: theme.colors.background.default,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
          }}
        >
          <Box direction="row" alignItems="center" gap="sm" mb="sm">
            <SkeletonBox width={44} height={44} borderRadius={theme.radius.md} />
            <Box flex gap="xs">
              <SkeletonBox width={100} height={16} />
              <SkeletonBox width={80} height={12} />
            </Box>
          </Box>
          <SkeletonBox width="100%" height={1} style={{ marginBottom: 10 }} />
          <Box gap="sm" mb="sm">
            <SkeletonBox width="90%" height={14} />
            <SkeletonBox width="75%" height={14} />
            <SkeletonBox width="85%" height={14} />
          </Box>
          <SkeletonBox width="100%" height={40} borderRadius={theme.radius.lg} />
        </Box>
      ))}
    </ScrollView>
  );
}
