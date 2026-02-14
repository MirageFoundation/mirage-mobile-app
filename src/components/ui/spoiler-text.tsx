import { memo, useState } from "react";
import { Pressable, type TextStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { triggerHaptic } from "@/src/components/utils/haptics";

type SpoilerTextProps = {
  children: string;
  textStyle?: TextStyle;
};

const DURATION = 250;

export const SpoilerText = memo(function SpoilerText({
  children,
  textStyle,
}: SpoilerTextProps) {
  const { theme } = useUnistyles();
  const [revealed, setRevealed] = useState(false);
  const progress = useSharedValue(0);

  const handlePress = () => {
    triggerHaptic("light");
    const next = !revealed;
    setRevealed(next);
    progress.value = withTiming(next ? 1 : 0, { duration: DURATION });
  };

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.text.subtle, "transparent"],
    ),
    borderRadius: theme.radius.sm,
    overflow: "hidden" as const,
    paddingHorizontal: 2,
  }));

  const textAnimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <Pressable onPress={handlePress} style={{ alignSelf: "flex-start" }}>
      <Animated.View style={bgStyle}>
        <Animated.Text
          style={[
            { color: theme.colors.text.default },
            textStyle,
            textAnimStyle,
          ]}
        >
          {children}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
});
