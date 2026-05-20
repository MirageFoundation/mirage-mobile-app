import { Image as ExpoImage } from "expo-image";
import { View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./annotate-styles";

const formatCount = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

type AnnotatePostSummaryProps = {
  comments: number;
  likes: number;
  thumbnail?: string;
  title?: string;
};

export function AnnotatePostSummary({
  comments,
  likes,
  thumbnail,
  title,
}: AnnotatePostSummaryProps) {
  const { theme } = useUnistyles();

  return (
    <View
      style={[
        styles.postSummary,
        {
          backgroundColor: theme.colors.background.default,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border.subtle,
        },
      ]}
    >
      <View style={styles.postSummaryInfo}>
        <Text
          size="md"
          weight="bold"
          numberOfLines={1}
          style={styles.postSummaryTitle}
        >
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
