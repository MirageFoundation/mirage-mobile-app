import { Image } from "expo-image";
import { View, type ViewStyle } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";

import type { Post } from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";
import { styles } from "./post-detail-styles";

type PostDetailTheme = {
  colors: {
    background: { default: string };
  };
};

type PostDetailStickySummaryProps = {
  animatedStyle: AnimatedStyle<ViewStyle>;
  formatCount: (value: number) => string;
  insetsTop: number;
  isInteractive: boolean;
  post?: Post | null;
  theme: PostDetailTheme;
};

export function PostDetailStickySummary({
  animatedStyle,
  formatCount,
  insetsTop,
  isInteractive,
  post,
  theme,
}: PostDetailStickySummaryProps) {
  const postThumbnail = post?.media?.[0]?.uri;

  return (
    <Animated.View
      style={[
        styles.stickyHeader,
        {
          backgroundColor: theme.colors.background.default,
          // Sit just below the header divider (40px row + 1px divider) so the
          // divider stays visible when the sticky summary slides in.
          top: insetsTop + 41,
        },
        animatedStyle,
      ]}
      pointerEvents={isInteractive ? "auto" : "none"}
    >
      <View style={styles.stickyHeaderContent}>
        <View style={styles.stickyHeaderInfo}>
          <Text
            size="md"
            weight="bold"
            numberOfLines={1}
            style={styles.stickyHeaderTitle}
          >
            {post?.title}
          </Text>
          <View style={styles.stickyHeaderStats}>
            <Text size="sm" mode="subtle">
              {formatCount(post?.likes ?? 0)} upvotes
            </Text>
            <Text size="sm" mode="subtle" style={styles.stickyHeaderDot}>
              •
            </Text>
            <Text size="sm" mode="subtle">
              {formatCount(post?.comments ?? 0)} comments
            </Text>
          </View>
        </View>
        {postThumbnail && (
          <Image
            source={{ uri: postThumbnail }}
            style={styles.stickyHeaderThumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        )}
      </View>
    </Animated.View>
  );
}
