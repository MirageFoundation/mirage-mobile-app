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

  return (
    <Animated.View
      style={[styles.container, { paddingTop: insets.top }, animatedStyle]}
    >
      <View style={styles.content}>
        {/* Left section - Menu button and Title (as feed type selector) */}
        <View style={styles.leftSection}>
          <Pressable onPress={onMenuPress} style={styles.iconButton}>
            <Ionicons
              name="menu-outline"
              size={24}
              color={theme.colors.text.default}
            />
          </Pressable>
          <Pressable onPress={onFeedTypePress} style={styles.titleButton}>
            <Text size="xl" weight="bold">
              {title}
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
        </View>

        {/* Right section - Search */}
        <Pressable onPress={onSearchPress} style={styles.iconButton}>
          <Ionicons
            name="search-outline"
            size={22}
            color={theme.colors.text.default}
          />
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
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  titleButton: {
    flexDirection: "row",
    alignItems: "center",
  },
}));
