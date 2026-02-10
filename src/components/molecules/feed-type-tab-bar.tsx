import { useCallback } from "react";
import { Dimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import { triggerHaptic } from "@/src/components/utils/haptics";
import type { FeedType } from "@/src/stores";

export const FEED_TAB_BAR_HEIGHT = 44;

const SCREEN_WIDTH = Dimensions.get("window").width;
const TAB_WIDTH = SCREEN_WIDTH / 2;
const INDICATOR_WIDTH = TAB_WIDTH / 3;
const INDICATOR_OFFSET = (TAB_WIDTH - INDICATOR_WIDTH) / 2;

const GRADIENT_COLORS = ["rgb(102, 126, 234)", "rgb(118, 75, 162)"] as const;

type FeedTab = {
  value: FeedType;
  label: string;
};

const FEED_TABS: FeedTab[] = [
  { value: "home", label: "Magic" },
  { value: "latest", label: "Latest" },
];

type AnimatedTabTextProps = {
  label: string;
  index: number;
  scrollProgress: SharedValue<number> | undefined;
  selectedIndex: number;
  activeColor: string;
  inactiveColor: string;
};

const AnimatedTabText = ({
  label,
  index,
  scrollProgress,
  selectedIndex,
  activeColor,
  inactiveColor,
}: AnimatedTabTextProps) => {
  const colorStyle = useAnimatedStyle(() => {
    const progress = scrollProgress?.value ?? selectedIndex;
    const color = index === 0
      ? interpolateColor(progress, [0, 1], [activeColor, inactiveColor])
      : interpolateColor(progress, [0, 1], [inactiveColor, activeColor]);
    return { color };
  });

  return (
    <Animated.Text style={[styles.tabText, colorStyle]}>
      {label}
    </Animated.Text>
  );
};

type FeedTypeTabBarProps = {
  selectedIndex: number;
  onTabChange: (index: number) => void;
  scrollProgress?: SharedValue<number>;
  animatedStyle?: any;
};

export const FeedTypeTabBar = ({
  selectedIndex,
  onTabChange,
  scrollProgress,
  animatedStyle,
}: FeedTypeTabBarProps) => {
  const { theme } = useUnistyles();

  const handleTabPress = useCallback(
    (index: number) => {
      if (index !== selectedIndex) {
        triggerHaptic("light");
        onTabChange(index);
      }
    },
    [selectedIndex, onTabChange]
  );

  const indicatorStyle = useAnimatedStyle(() => {
    const progress = scrollProgress?.value ?? selectedIndex;
    const position = progress * TAB_WIDTH + INDICATOR_OFFSET;
    return {
      transform: [
        {
          translateX: position,
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.tabsContainer}>
        {FEED_TABS.map((tab, index) => {
          return (
            <AnimatedPressable
              key={tab.value}
              scaleAmount={0.95}
              onPress={() => handleTabPress(index)}
              style={styles.tab}
            >
              <AnimatedTabText
                label={tab.label}
                index={index}
                scrollProgress={scrollProgress}
                selectedIndex={selectedIndex}
                activeColor={theme.colors.text.default}
                inactiveColor={theme.colors.text.subtle}
              />
            </AnimatedPressable>
          );
        })}
        <Animated.View
          style={[
            styles.indicatorContainer,
            { width: INDICATOR_WIDTH },
            indicatorStyle,
          ]}
        >
          <LinearGradient
            colors={GRADIENT_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.indicator}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    height: FEED_TAB_BAR_HEIGHT,
    backgroundColor: theme.colors.background.default,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border.subtle,
    width: "100%",
  },
  tabsContainer: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
    width: "100%",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
  },
  indicatorContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 3,
  },
  indicator: {
    flex: 1,
    borderRadius: 1,
  },
}));
