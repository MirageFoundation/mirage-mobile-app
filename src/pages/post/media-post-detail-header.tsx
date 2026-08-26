import { AntDesign, Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

import { styles } from "./media-post-detail-styles";

type MediaPostDetailHeaderProps = {
  topic?: string;
  paddingTop: number;
  height: number;
  animatedStyle: any;
  pointerEvents: "box-none" | "none";
  onBack: () => void;
  onTopicPress: () => void;
  onOptionsPress: () => void;
};

export function MediaPostDetailHeader({
  topic,
  paddingTop,
  height,
  animatedStyle,
  pointerEvents,
  onBack,
  onTopicPress,
  onOptionsPress,
}: MediaPostDetailHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <Animated.View
      style={[
        styles.header,
        { paddingTop, height },
        animatedStyle,
      ]}
      pointerEvents={pointerEvents}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close post"
        onPress={onBack}
        style={styles.headerBtn}
        hitSlop={8}
      >
        <AntDesign name="close" size={22} color={theme.colors.text.default} />
      </Pressable>
      <View style={styles.headerCenter}>
        {topic ? (
          <Pressable onPress={onTopicPress}>
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
        onPress={onOptionsPress}
        style={styles.headerBtn}
        hitSlop={8}
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={22}
          color={theme.colors.text.default}
        />
      </Pressable>
    </Animated.View>
  );
}
