import { MenuIcon } from "@/assets/figma-icons";
import { Ionicons } from "@expo/vector-icons";
import { Image, View } from "react-native";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { HEADER_HEIGHT } from "@/src/hooks/use-scroll-animation";

type FeedHeaderProps = {
  title: string;
  onMenuPress?: () => void;
  onSearchPress?: () => void;
  animatedStyle?: any;
};

export const FeedHeader = ({
  title,
  onMenuPress,
  onSearchPress,
  animatedStyle,
}: FeedHeaderProps) => {
  const insets = useSafeAreaInsets();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const AppIcon = () =>
    isDark ? (
      <Image
        source={require("@/assets/images/app-dark-icon.png")}
        style={styles.appIcon}
        resizeMode="contain"
      />
    ) : (
      <Image
        source={require("@/assets/images/app-icon.png")}
        style={styles.appIcon}
        resizeMode="contain"
      />
    );

  return (
    <Animated.View
      style={[styles.container, { paddingTop: insets.top }, animatedStyle]}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          {onMenuPress && (
            <AnimatedPressable scaleAmount={0.85} onPress={onMenuPress} style={styles.iconButton}>
              <MenuIcon size={18} color={theme.colors.text.default} />
            </AnimatedPressable>
          )}

          <View style={styles.titleButton}>
            <AppIcon />
            <Text size="xl" weight="bold">
              {title}
            </Text>
          </View>
        </View>

        <AnimatedPressable scaleAmount={0.85} onPress={onSearchPress} style={styles.iconButton}>
          <Ionicons
            name="search-outline"
            size={20}
            color={theme.colors.text.default}
          />
        </AnimatedPressable>
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
    paddingHorizontal: theme.spacing.sm,
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
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  appIcon: {
    width: 22,
    height: 22,
    marginRight: 6,
  },
}));
