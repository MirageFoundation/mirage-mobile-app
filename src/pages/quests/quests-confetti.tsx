import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  CONFETTI_COLORS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "./quests-ui-constants";

function ConfettiPiece({ delay, index }: { delay: number; index: number }) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  const startX = Math.random() * SCREEN_WIDTH;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 8 + Math.random() * 8;
  const isCircle = Math.random() > 0.5;

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 100;

    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration: 3000 + Math.random() * 2000,
        easing: Easing.out(Easing.quad),
      }),
    );

    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(drift, { duration: 500 }),
          withTiming(-drift, { duration: 500 }),
        ),
        -1,
        true,
      ),
    );

    rotate.value = withDelay(
      delay,
      withRepeat(
        withTiming(360, { duration: 1000 + Math.random() * 1000 }),
        -1,
        false,
      ),
    );

    opacity.value = withDelay(delay + 2000, withTiming(0, { duration: 1000 }));

    scale.value = withDelay(
      delay,
      withSequence(
        withSpring(1.2, { damping: 8 }),
        withSpring(1, { damping: 10 }),
      ),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(rotate);
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    };
  }, [delay, opacity, rotate, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: startX,
          top: 0,
          width: size,
          height: isCircle ? size : size * 0.6,
          backgroundColor: color,
          borderRadius: isCircle ? size / 2 : 2,
        },
        animatedStyle,
      ]}
    />
  );
}

export function ConfettiAnimation({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {Array.from({ length: 50 }).map((_, i) => (
        <ConfettiPiece key={i} index={i} delay={i * 30} />
      ))}
    </View>
  );
}
