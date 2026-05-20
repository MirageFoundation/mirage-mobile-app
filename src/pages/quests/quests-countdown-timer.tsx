import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { styles } from "./quests-styles";
import { formatTimeRemaining } from "./quests-ui-constants";

export function CountdownTimer({
  secondsRemaining,
  onTick,
}: {
  secondsRemaining: number;
  onTick: (seconds: number) => void;
}) {
  const { theme } = useUnistyles();
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulseAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      onTick(Math.max(0, secondsRemaining - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining, onTick]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const progress = 1 - secondsRemaining / (24 * 60 * 60);

  return (
    <Box
      rounded="lg"
      p="lg"
      mb="lg"
      style={[
        styles.timerCard,
        {
          backgroundColor: theme.colors.background.default,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        },
      ]}
    >
      <Box
        style={[
          styles.timerGlow,
          { backgroundColor: theme.colors.primary[500] },
        ]}
      />
      <Box
        style={[
          styles.timerGlowLeft,
          { backgroundColor: theme.colors.primary[500] },
        ]}
      />
      <Box
        style={[
          styles.timerGlowRight,
          { backgroundColor: theme.colors.primary[500] },
        ]}
      />
      <Box alignItems="center" gap="sm">
        <Text size="sm" weight="semibold" mode="subtle">
          TIME REMAINING
        </Text>
        <Animated.View style={pulseStyle}>
          <Text
            size="mega"
            weight="bold"
            style={{ color: theme.colors.primary[500], letterSpacing: 2 }}
          >
            {formatTimeRemaining(secondsRemaining)}
          </Text>
        </Animated.View>
        <Box
          style={[
            styles.progressBarContainer,
            { backgroundColor: "rgba(255,255,255,0.1)" },
          ]}
        >
          <Box
            style={[
              styles.progressBarFill,
              {
                backgroundColor: theme.colors.primary[500],
                width: `${progress * 100}%`,
              },
            ]}
          />
        </Box>
        <Text size="sm" mode="subtle">
          Complete quests before timer resets
        </Text>
      </Box>
    </Box>
  );
}

