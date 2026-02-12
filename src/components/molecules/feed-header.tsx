import { MenuIcon } from "@/assets/figma-icons";
import { Ionicons } from "@expo/vector-icons";
import { Image, View } from "react-native";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { HEADER_HEIGHT } from "@/src/hooks/use-scroll-animation";
import { formatCompactNumber } from "@/src/utils/format-number";
import { triggerHaptic } from "@/src/components/utils/haptics";

type FeedOption = {
  label: string;
  value: string;
};

type FeedHeaderProps = {
  title: string;
  balance?: number | null;
  onMenuPress?: () => void;
  onSearchPress?: () => void;
  animatedStyle?: any;
  feedType?: string;
  feedOptions?: FeedOption[];
  onFeedTypeChange?: (value: string) => void;
};

export const FeedHeader = ({
  title,
  balance,
  onMenuPress,
  onSearchPress,
  animatedStyle,
  feedType,
  feedOptions,
  onFeedTypeChange,
}: FeedHeaderProps) => {
  const insets = useSafeAreaInsets();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const hasFeedOptions =
    feedOptions && feedOptions.length > 0 && onFeedTypeChange;

  return (
    <Animated.View
      style={[styles.container, { paddingTop: insets.top }, animatedStyle]}
    >
      <View style={styles.content}>
        <View style={[styles.leftSection, !onMenuPress && { paddingLeft: 12 }]}>
          {onMenuPress && (
            <AnimatedPressable
              scaleAmount={0.85}
              onPress={onMenuPress}
              style={styles.iconButton}
            >
              <MenuIcon size={18} color={theme.colors.text.default} />
            </AnimatedPressable>
          )}

          <Image
            source={
              isDark
                ? require("@/assets/images/app-dark-icon.png")
                : require("@/assets/images/app-icon.png")
            }
            style={styles.appIcon}
            resizeMode="contain"
          />

          {hasFeedOptions && (
            <View style={[styles.toggleContainer]}>
              {feedOptions.map((option, index) => {
                const isActive = option.value === feedType;
                return (
                  <View key={option.value} style={styles.toggleRow}>
                    {index > 0 && (
                      <View
                        style={{
                          width: 1,
                          height: 14,
                          backgroundColor: theme.colors.border.default,
                        }}
                      />
                    )}
                    <AnimatedPressable
                      scaleAmount={0.9}
                      onPress={() => {
                        triggerHaptic("light");
                        onFeedTypeChange(option.value);
                      }}
                      style={styles.toggleButton}
                    >
                      <Text
                        size="xl"
                        weight={isActive ? "bold" : "medium"}
                        style={{
                          color: isActive
                            ? theme.colors.text.default
                            : theme.colors.text.subtle,
                        }}
                      >
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.rightSection}>
          {balance != null && (
            <Text size="xl" weight="bold" style={styles.balanceText}>
              {formatCompactNumber(Math.floor(balance / 1_000_000))}
            </Text>
          )}
          <AnimatedPressable
            scaleAmount={0.85}
            onPress={onSearchPress}
            style={styles.iconButton}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={theme.colors.text.default}
            />
          </AnimatedPressable>
        </View>
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
    gap: 8,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  balanceText: {},
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  appIcon: {
    width: 22,
    height: 22,
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
}));
