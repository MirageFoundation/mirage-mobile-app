import { Text } from "@/src/components/ui/primitives";
import { HEADER_HEIGHT } from "@/src/hooks/use-scroll-animation";
import type { FeedType } from "@/src/stores";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type FeedHeaderProps = {
  title: string;
  feedType?: FeedType;
  onFeedTypePress?: () => void;
  onMenuPress?: () => void;
  onSearchPress?: () => void;
  animatedStyle?: any;
};

export const FeedHeader = ({
  title,
  feedType,
  onFeedTypePress,
  onMenuPress,
  onSearchPress,
  animatedStyle,
}: FeedHeaderProps) => {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const feedTypeLabels: Record<FeedType, string> = {
    home: "Home",
    popular: "Popular",
    news: "News",
  };

  return (
    <Animated.View
      style={[styles.container, { paddingTop: insets.top }, animatedStyle]}
    >
      <View style={styles.content}>
        {/* Left - Menu button */}
        <Pressable onPress={onMenuPress} style={styles.iconButton}>
          <Ionicons name="menu" size={24} color={theme.colors.text.default} />
        </Pressable>

        {/* Center - Title with dropdown */}
        <Pressable onPress={onFeedTypePress} style={styles.titleContainer}>
          <Text size="lg" weight="semibold">
            {feedType ? feedTypeLabels[feedType] : title}
          </Text>
          {feedType && (
            <Ionicons
              name="chevron-down"
              size={16}
              color={theme.colors.text.subtle}
              style={{ marginLeft: 4 }}
            />
          )}
        </Pressable>

        {/* Right - Search button */}
        <Pressable onPress={onSearchPress} style={styles.iconButton}>
          <Ionicons name="search" size={24} color={theme.colors.text.default} />
        </Pressable>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border.subtle,
    zIndex: 100,
  },
  content: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
}));
