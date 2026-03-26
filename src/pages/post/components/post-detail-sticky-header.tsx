import { Image } from "expo-image";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { formatCount } from "../post-detail-utils";

type PostDetailStickyHeaderProps = {
  backgroundColor: string;
  top: number;
  animatedStyle: object;
  isInteractive: boolean;
  title?: string;
  likes?: number;
  comments?: number;
  thumbnailUri?: string;
};

export function PostDetailStickyHeader({
  backgroundColor,
  top,
  animatedStyle,
  isInteractive,
  title,
  likes = 0,
  comments = 0,
  thumbnailUri,
}: PostDetailStickyHeaderProps) {
  return (
    <Animated.View
      style={[
        styles.stickyHeader,
        {
          backgroundColor,
          top,
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
            {title}
          </Text>
          <View style={styles.stickyHeaderStats}>
            <Text size="sm" mode="subtle">
              {formatCount(likes)} upvotes
            </Text>
            <Text size="sm" mode="subtle" style={styles.stickyHeaderDot}>
              •
            </Text>
            <Text size="sm" mode="subtle">
              {formatCount(comments)} comments
            </Text>
          </View>
        </View>
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.stickyHeaderThumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stickyHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    overflow: "hidden",
  },
  stickyHeaderContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  stickyHeaderInfo: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    justifyContent: "center",
  },
  stickyHeaderTitle: {
    lineHeight: 18,
  },
  stickyHeaderStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  stickyHeaderDot: {
    marginHorizontal: theme.spacing.xs,
  },
  stickyHeaderThumbnail: {
    width: 52,
    height: "100%",
    minHeight: 48,
    marginLeft: theme.spacing.sm,
  },
}));
