import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import {
  SAVED_POSTS_SCREEN_WIDTH,
} from "./saved-posts-utils";

export const SAVED_TABS = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
] as const;

const TAB_COUNT = SAVED_TABS.length;

const AnimatedTabLabel = ({
  activeColor,
  animatedIndex,
  inactiveColor,
  index,
  label,
}: {
  activeColor: string;
  animatedIndex: SharedValue<number>;
  inactiveColor: string;
  index: number;
  label: string;
}) => {
  const animStyle = useAnimatedStyle(() => {
    const distance = Math.abs(animatedIndex.value - index);
    const opacity = interpolate(distance, [0, 0.5, 1], [1, 0.6, 0.5], "clamp");
    const scale = interpolate(distance, [0, 1], [1, 0.97], "clamp");
    const color = interpolateColor(
      distance,
      [0, 0.5],
      [activeColor, inactiveColor],
    );
    return {
      opacity,
      transform: [{ scale }],
      color,
      fontWeight: distance < 0.5 ? "700" : "500",
    } as any;
  });

  return <Animated.Text style={[styles.tabLabel, animStyle]}>{label}</Animated.Text>;
};

export const SAVED_TAB_VELOCITY_THRESHOLD = 500;

export function SavedTabBar({
  activeTab,
  animatedIndex: externalAnimatedIndex,
  onTabChange,
}: {
  activeTab: number;
  animatedIndex?: SharedValue<number>;
  onTabChange: (index: number) => void;
}) {
  const { theme } = useUnistyles();
  const internalIndex = useSharedValue(activeTab);
  const animatedIndex = externalAnimatedIndex ?? internalIndex;

  useEffect(() => {
    if (!externalAnimatedIndex) {
      internalIndex.value = withTiming(activeTab, { duration: 200 });
    }
  }, [activeTab, externalAnimatedIndex, internalIndex]);

  const singleTabWidth = SAVED_POSTS_SCREEN_WIDTH / TAB_COUNT;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: animatedIndex.value * singleTabWidth }],
  }));

  return (
    <View style={styles.tabBarContainer}>
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.colors.background.default },
        ]}
      >
        {SAVED_TABS.map((tab, index) => (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(index)}
            style={styles.tab}
          >
            <AnimatedTabLabel
              label={tab.label}
              index={index}
              animatedIndex={animatedIndex}
              activeColor={theme.colors.text.default}
              inactiveColor={theme.colors.text.subtle}
            />
          </Pressable>
        ))}
      </View>
      <Animated.View
        style={[
          styles.indicator,
          { width: singleTabWidth, backgroundColor: theme.colors.text.default },
          indicatorStyle,
        ]}
      />
      <View
        style={[
          styles.tabBarBorder,
          { backgroundColor: theme.colors.border.subtle },
        ]}
      />
    </View>
  );
}

const styles = {
  tabBarContainer: {
    position: "relative" as const,
  },
  tabBar: {
    flexDirection: "row" as const,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  tabLabel: {
    fontSize: 14,
  },
  indicator: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    height: 2,
  },
  tabBarBorder: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
};
