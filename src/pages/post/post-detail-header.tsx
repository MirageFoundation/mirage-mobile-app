import { AntDesign, Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

import { styles } from "./post-detail-styles";

type PostDetailHeaderProps = {
  topic?: string;
  isLoadingTopic?: boolean;
  insetsTop: number;
  onBack: () => void;
  onTopicPress?: () => void;
  onOptionsPress?: () => void;
};

export function PostDetailHeader({
  topic,
  isLoadingTopic = false,
  insetsTop,
  onBack,
  onTopicPress,
  onOptionsPress,
}: PostDetailHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View style={{ paddingTop: insetsTop }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close post"
          onPress={onBack}
          style={styles.headerButton}
          hitSlop={8}
        >
          <AntDesign name="close" size={22} color={theme.colors.text.default} />
        </Pressable>
        <View style={styles.headerCenter}>
          {isLoadingTopic && !topic ? (
            <View style={styles.headerTopicSkeleton} />
          ) : topic ? (
            <Pressable onPress={onTopicPress} disabled={!onTopicPress}>
              <Text
                size="lg"
                weight="semibold"
                numberOfLines={1}
                style={{ color: theme.colors.text.default }}
              >
                {`#${topic}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
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
      </View>
      <View style={styles.headerDivider} />
    </View>
  );
}
