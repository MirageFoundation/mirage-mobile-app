import { memo, useState } from "react";
import type { TextStyle } from "react-native";
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

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.text.subtle, theme.colors.background.subtle],
    ),
    color: interpolateColor(
      progress.value,
      [0, 1],
      ["transparent", theme.colors.text.default],
    ),
  }));

  return (
    <Animated.Text
      onPress={handlePress}
      suppressHighlighting
      style={[
        textStyle,
        {
          borderRadius: theme.radius.md,
          overflow: "hidden",
          paddingHorizontal: 2,
        },
        animStyle,
      ]}
    >
      {children}
    </Animated.Text>
  );
});
