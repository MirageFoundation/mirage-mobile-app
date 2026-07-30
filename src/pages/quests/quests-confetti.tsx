import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import {
  cancelConfettiAnimationChannels,
  CONFETTI_PARTICLE_COUNT,
  getConfettiParticleDelay,
  getConfettiTimingPolicy,
} from "./quests-confetti-policy";
import {
  CONFETTI_COLORS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "./quests-ui-constants";

function ConfettiPiece({
  delay,
  index,
  reducedMotion,
}: {
  delay: number;
  index: number;
  reducedMotion: boolean;
}) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const timing = getConfettiTimingPolicy(reducedMotion);

  const startX = Math.random() * SCREEN_WIDTH;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 8 + Math.random() * 8;
  const isCircle = Math.random() > 0.5;

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 100;
    const animationChannels = {
      opacity,
      rotate,
      scale,
      translateX,
      translateY,
    };

    cancelConfettiAnimationChannels(animationChannels, cancelAnimation);
    opacity.value = 1;
    rotate.value = 0;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = -50;

    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration: timing.movementDurationMs,
        easing: Easing.out(Easing.quad),
      }),
    );

    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(drift, { duration: timing.driftLegDurationMs }),
          withTiming(-drift, { duration: timing.driftLegDurationMs }),
        ),
        timing.driftRepeatCount,
        true,
      ),
    );

    rotate.value = withDelay(
      delay,
      withTiming(timing.rotationDegrees, {
        duration: timing.movementDurationMs,
      }),
    );

    opacity.value = withDelay(
      delay + timing.fadeDelayMs,
      withTiming(0, { duration: timing.fadeDurationMs }),
    );

    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.2, { duration: timing.scaleLegDurationMs }),
        withTiming(1, { duration: timing.scaleLegDurationMs }),
      ),
    );

    return () => {
      cancelConfettiAnimationChannels(animationChannels, cancelAnimation);
    };
  }, [delay, opacity, rotate, scale, timing, translateX, translateY]);

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
  const reducedMotion = useReducedMotion();

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
      {Array.from({ length: CONFETTI_PARTICLE_COUNT }).map((_, i) => (
        <ConfettiPiece
          key={i}
          index={i}
          delay={getConfettiParticleDelay(i, reducedMotion)}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}
