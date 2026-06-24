import { MenuIcon } from "@/assets/figma-icons";
import { Ionicons } from "@expo/vector-icons";
import { Image, View } from "react-native";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";

import { Text } from "@/src/components/ui/primitives";
import { HEADER_HEIGHT } from "@/src/hooks/use-scroll-animation";
import { formatCompactNumber } from "@/src/utils/format-number";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { FeedDensityToggle } from "./feed-density-toggle";

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
  borderBottomColor?: string;
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
  borderBottomColor,
}: FeedHeaderProps) => {
  const insets = useSafeAreaInsets();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const currentFeedLabel = feedOptions?.find(
    (o) => o.value === feedType,
  )?.label;

  const hasFeedOptions =
    feedOptions && feedOptions.length > 0 && onFeedTypeChange;

  const AppIcon = () => (
    <Image
      source={
        isDark
          ? require("@/assets/images/app-dark-icon.png")
          : require("@/assets/images/app-icon.png")
      }
      style={styles.appIcon}
      resizeMode="contain"
    />
  );

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top },
        borderBottomColor ? { borderBottomColor } : null,
        animatedStyle,
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.leftSection, !onMenuPress && { paddingLeft: 12 }]}>
          {onMenuPress && (
            <AnimatedPressable
              scaleAmount={0.85}
              onPress={onMenuPress}
              style={styles.iconButton}
            >
              <MenuIcon size={22} color={theme.colors.text.default} />
            </AnimatedPressable>
          )}

          {hasFeedOptions ? (
            <View style={styles.titleButton}>
              <AppIcon />
              <Text size="xl" weight="bold">
                {title}
              </Text>
            <Menu>
              <MenuTrigger
                customStyles={{
                  triggerTouchable: {
                    hitSlop: { top: 8, bottom: 8, left: 4, right: 4 },
                  },
                }}
              >
                <View style={styles.feedSelector}>
                  {currentFeedLabel && (
                    <Text
                      size="xl"
                      weight="medium"
                      style={{
                        color: theme.colors.text.subtle,
                        marginLeft: 6,
                      }}
                    >
                      ǀ {currentFeedLabel}
                    </Text>
                  )}
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={theme.colors.text.subtle}
                    style={{ marginLeft: 2, marginTop: 4 }}
                  />
                </View>
              </MenuTrigger>
              <MenuOptions
                customStyles={{
                  optionsContainer: {
                    backgroundColor: theme.colors.background.default,
                    borderRadius: theme.radius.lg,
                    minWidth: 180,
                    shadowColor: theme.colors.contrast.base,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border.subtle,
                    marginTop: 4,
                    paddingVertical: 4,
                  },
                }}
              >
                {feedOptions?.map((option, index) => {
                  const isActive = option.value === feedType;
                  return (
                    <View key={option.value}>
                      {index > 0 && (
                        <View
                          style={{
                            height: 1,
                            backgroundColor: theme.colors.border.subtle,
                            marginHorizontal: theme.spacing.md,
                            marginVertical: 2,
                          }}
                        />
                      )}
                      <MenuOption
                        onSelect={() => {
                          triggerHaptic("light");
                          onFeedTypeChange?.(option.value);
                        }}
                      >
                        <View style={styles.menuOption}>
                          <Ionicons
                            name={
                              isActive ? "checkmark-circle" : "ellipse-outline"
                            }
                            size={18}
                            color={
                              isActive
                                ? theme.colors.primary[500]
                                : theme.colors.text.subtle
                            }
                          />
                          <Text
                            size="lg"
                            weight={isActive ? "semibold" : "medium"}
                            style={
                              isActive
                                ? { color: theme.colors.primary[500] }
                                : undefined
                            }
                          >
                            {option.label}
                          </Text>
                        </View>
                      </MenuOption>
                    </View>
                  );
                })}
              </MenuOptions>
            </Menu>
            </View>
          ) : (
            <View style={styles.titleButton}>
              <AppIcon />
              <Text size="xl" weight="bold">
                {title}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rightSection}>
          <FeedDensityToggle />
          <AnimatedPressable
            scaleAmount={0.85}
            onPress={onSearchPress}
            style={styles.iconButton}
          >
            <Ionicons
              name="search-outline"
              size={22}
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
  titleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  feedSelector: {
    flexDirection: "row",
    alignItems: "center",
  },
  appIcon: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
}));
