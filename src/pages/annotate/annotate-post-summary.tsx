import { View } from "react-native";
import { Image as ExpoImage } from "expo-image";

import { Text } from "@/src/components/ui/primitives";

const formatCount = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

export function AnnotatePostSummary({
  borderColor,
  comments,
  likes,
  subtleBackground,
  subtleTextColor,
  thumbnail,
  title,
}: {
  borderColor: string;
  comments: number;
  likes: number;
  subtleBackground: string;
  subtleTextColor: string;
  thumbnail?: string;
  title: string;
}) {
  return (
    <View
      style={[
        styles.postSummary,
        {
          backgroundColor: subtleBackground,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        },
      ]}
    >
      <View style={styles.postSummaryInfo}>
        <Text size="md" weight="bold" numberOfLines={1} style={styles.postSummaryTitle}>
          {title || "Untitled post"}
        </Text>
        <View style={styles.postSummaryStats}>
          <Text size="sm" mode="subtle">
            {formatCount(likes)} upvotes
          </Text>
          <Text size="sm" mode="subtle" style={styles.postSummaryDot}>
            •
          </Text>
          <Text size="sm" mode="subtle">
            {formatCount(comments)} comments
          </Text>
        </View>
      </View>
      {thumbnail ? (
        <ExpoImage
          source={{ uri: thumbnail }}
          style={styles.postSummaryThumb}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  );
}

const styles = {
  postSummary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  postSummaryInfo: {
    flex: 1,
    marginRight: 12,
  },
  postSummaryTitle: {
    marginBottom: 4,
  },
  postSummaryStats: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  postSummaryDot: {
    marginHorizontal: 6,
  },
  postSummaryThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
};
