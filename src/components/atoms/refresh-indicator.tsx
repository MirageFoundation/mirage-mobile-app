import React, { useEffect } from "react";
import { Image, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  useDerivedValue,
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const SIZE = 36;
const RING_SIZE = SIZE + 20;
const PULL_THRESHOLD = 60;

function AnimatedIcon({ spin, pulse }: { spin: SharedValue<number>; pulse: SharedValue<number> }) {
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [0.92, 1.08]) },
    ],
  }));

  return (
    <View style={{ width: RING_SIZE + 4, height: RING_SIZE + 4, alignItems: "center", justifyContent: "center", overflow: "visible" }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RING_SIZE / 2,
            overflow: "hidden",
          },
          ringStyle,
        ]}
      >
        <LinearGradient
          colors={["#6366f1", "#4285f4", "#06b6d4", "#6366f1"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RING_SIZE / 2,
          }}
        />
      </Animated.View>
      <Animated.View style={iconStyle}>
        <Image
          source={require("@/assets/images/app-dark-icon.png")}
          style={{ width: SIZE - 4, height: SIZE - 4 }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

function useRefreshAnimations() {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);

  const start = () => {
    spin.value = 0;
    pulse.value = 0;
    spin.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  };

  const stop = () => {
    cancelAnimation(spin);
    cancelAnimation(pulse);
    spin.value = 0;
    pulse.value = 0;
  };

  return { spin, pulse, start, stop };
}

export function RefreshIndicator() {
  const { spin, pulse, start, stop } = useRefreshAnimations();

  useEffect(() => {
    start();
    return stop;
  }, []);

  return (
    <View style={{ alignItems: "center", paddingVertical: 16, overflow: "visible" }}>
      <AnimatedIcon spin={spin} pulse={pulse} />
    </View>
  );
}

type IOSRefreshIndicatorProps = {
  visible: boolean;
  topOffset: number;
  scrollY: SharedValue<number>;
};

export function IOSRefreshIndicator({ visible, topOffset, scrollY }: IOSRefreshIndicatorProps) {
  const { spin, pulse, start, stop } = useRefreshAnimations();
  const isRefreshing = useSharedValue(false);

  useEffect(() => {
    isRefreshing.value = visible;
    if (visible) {
      start();
    } else {
      stop();
    }
  }, [visible]);

  const progress = useDerivedValue(() => {
    if (isRefreshing.value) return 1;
    const pull = -scrollY.value;
    if (pull <= 0) return 0;
    return Math.min(pull / PULL_THRESHOLD, 1);
  });

  const wrapperStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      position: "absolute" as const,
      top: topOffset,
      left: 0,
      right: 0,
      alignItems: "center" as const,
      zIndex: 10,
      pointerEvents: "none" as const,
      transform: [{ translateY: interpolate(p, [0, 1], [-RING_SIZE, 0]) }],
      opacity: p,
    };
  });

  const scaleStyle = useAnimatedStyle(() => {
    const s = isRefreshing.value
      ? 1
      : interpolate(progress.value, [0, 1], [0.5, 1]);
    return { transform: [{ scale: s }] };
  });

  return (
    <Animated.View style={wrapperStyle}>
      <Animated.View style={scaleStyle}>
        <AnimatedIcon spin={spin} pulse={pulse} />
      </Animated.View>
    </Animated.View>
  );
}
