import { MenuIcon } from "@/assets/figma-icons";
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, View } from "react-native";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { HEADER_HEIGHT } from "@/src/hooks/use-scroll-animation";
import type { FeedType } from "@/src/stores";

// Mirage brand color
const MIRAGE_COLOR = "rgb(232, 84, 41)";

type FeedOption = {
  value: FeedType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
};

const FEED_OPTIONS: FeedOption[] = [
  { value: "home", label: "Home", icon: "home-outline", iconFilled: "home" },
  {
    value: "latest",
    label: "Latest",
    icon: "time-outline",
    iconFilled: "time",
  },
];

type FeedHeaderProps = {
  title: string;
  feedType?: FeedType;
  onFeedTypeChange?: (feedType: FeedType) => void;
  onMenuPress?: () => void;
  onSearchPress?: () => void;
  animatedStyle?: any;
};

export const FeedHeader = ({
  title,
  feedType = "home",
  onFeedTypeChange,
  onMenuPress,
  onSearchPress,
  animatedStyle,
}: FeedHeaderProps) => {
  const insets = useSafeAreaInsets();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  // Rotation animation for chevron
  const rotation = useSharedValue(0);

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleMenuOpen = () => {
    triggerHaptic("selection");
    rotation.value = withTiming(180, {
      duration: 200,
      easing: Easing.ease,
    });
  };

  const handleMenuClose = () => {
    rotation.value = withTiming(0, {
      duration: 200,
      easing: Easing.ease,
    });
  };

  const handleOptionSelect = (option: FeedOption) => {
    triggerHaptic("light");
    onFeedTypeChange?.(option.value);
  };

  return (
    <Animated.View
      style={[styles.container, { paddingTop: insets.top }, animatedStyle]}
    >
      <View style={styles.content}>
        {/* Left section - Menu button and Title (as feed type selector) */}
        <View style={styles.leftSection}>
          <Pressable onPress={onMenuPress} style={styles.iconButton}>
            <MenuIcon size={18} color={theme.colors.text.default} />
          </Pressable>

          {onFeedTypeChange ? (
            <Menu onOpen={handleMenuOpen} onClose={handleMenuClose}>
              <MenuTrigger>
                <View style={styles.titleButton}>
                  {feedType === "home" &&
                    (isDark ? (
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
                    ))}
                  <Text
                    size="xl"
                    weight="bold"
                    style={
                      feedType === "home"
                        ? { color: theme.colors.text.default }
                        : undefined
                    }
                  >
                    {title}
                  </Text>
                  <Animated.View
                    style={[{ marginLeft: 4 }, chevronAnimatedStyle]}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={theme.colors.text.subtle}
                    />
                  </Animated.View>
                </View>
              </MenuTrigger>
              <MenuOptions
                customStyles={{
                  optionsContainer: {
                    backgroundColor: theme.colors.background.default,
                    borderRadius: theme.radius.lg,
                    minWidth: 160,
                    shadowColor: theme.colors.contrast.base,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border.subtle,
                    marginTop: 37,
                    marginLeft: -8,
                  },
                }}
              >
                {FEED_OPTIONS.map((option, index) => {
                  const isSelected = option.value === feedType;
                  const isFirst = index === 0;
                  const isLast = index === FEED_OPTIONS.length - 1;
                  return (
                    <MenuOption
                      key={option.value}
                      onSelect={() => handleOptionSelect(option)}
                      customStyles={{
                        optionWrapper: {
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingVertical: theme.spacing.sm + 4,
                          paddingHorizontal: theme.spacing.md,
                          backgroundColor: isSelected
                            ? theme.colors.background.subtle
                            : "transparent",
                          ...(isSelected &&
                            isFirst && {
                              borderTopLeftRadius: theme.radius.lg,
                              borderTopRightRadius: theme.radius.lg,
                            }),
                          ...(isSelected &&
                            isLast && {
                              borderBottomLeftRadius: theme.radius.lg,
                              borderBottomRightRadius: theme.radius.lg,
                            }),
                        },
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Ionicons
                          name={isSelected ? option.iconFilled : option.icon}
                          size={18}
                          color={
                            isSelected
                              ? theme.colors.primary[500]
                              : theme.colors.text.subtle
                          }
                        />
                        <Text
                          size="md"
                          weight={isSelected ? "bold" : "medium"}
                          style={
                            isSelected
                              ? { color: theme.colors.primary[500] }
                              : undefined
                          }
                        >
                          {option.label}
                        </Text>
                      </View>
                    </MenuOption>
                  );
                })}
              </MenuOptions>
            </Menu>
          ) : (
            <View style={styles.titleButton}>
              {feedType === "home" &&
                (isDark ? (
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
                ))}
              <Text
                size="xl"
                weight="bold"
                style={
                  feedType === "home"
                    ? { color: theme.colors.text.default }
                    : undefined
                }
              >
                {title}
              </Text>
            </View>
          )}
        </View>

        {/* Right section - Search */}
        <Pressable onPress={onSearchPress} style={styles.iconButton}>
          <Ionicons
            name="search-outline"
            size={20}
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
