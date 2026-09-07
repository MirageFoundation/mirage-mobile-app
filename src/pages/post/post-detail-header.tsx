import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { SwipeBackGuard } from "@/src/components/ui/swipe-back-guard";

import { styles } from "./post-detail-styles";

type PostDetailHeaderProps = {
  topic?: string;
  isLoadingTopic?: boolean;
  insetsTop: number;
  onBack: () => void;
  onCommunityPress?: () => void;
  onOptionsPress?: () => void;
};

export function PostDetailHeader({
  topic,
  isLoadingTopic = false,
  insetsTop,
  onBack,
  onCommunityPress,
  onOptionsPress,
}: PostDetailHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View style={{ paddingTop: insetsTop }}>
      <View style={styles.header}>
        <SwipeBackGuard nativeChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close post"
          onPress={onBack}
          style={styles.headerButton}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text.default} />
        </Pressable>
        </SwipeBackGuard>
        <View style={styles.headerCenter}>
          {isLoadingTopic && !topic ? (
            <View style={styles.headerTopicSkeleton} />
          ) : topic ? (
            <SwipeBackGuard nativeChild>
            <Pressable onPress={onCommunityPress} disabled={!onCommunityPress}>
              <Text
                size="lg"
                weight="semibold"
                numberOfLines={1}
                style={{ color: theme.colors.text.default }}
              >
                {`[${topic}]`}
              </Text>
            </Pressable>
            </SwipeBackGuard>
          ) : null}
        </View>
        <SwipeBackGuard nativeChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open post options"
          accessibilityState={{ disabled: !onOptionsPress }}
          onPress={onOptionsPress}
          style={styles.headerButton}
          hitSlop={8}
          disabled={!onOptionsPress}
        >
          {onOptionsPress ? (
            <Ionicons
              name="ellipsis-horizontal"
              size={22}
              color={theme.colors.text.default}
            />
          ) : null}
        </Pressable>
        </SwipeBackGuard>
      </View>
      <View style={styles.headerDivider} />
    </View>
  );
}
