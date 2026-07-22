import React, { useCallback, useEffect } from "react";
import { Image, type ImageSourcePropType, View } from "react-native";
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
import { useUnistyles } from "react-native-unistyles";

const SIZE = 36;
const RING_SIZE = SIZE + 20;
const RING_BORDER_WIDTH = 3;
const PULL_THRESHOLD = 60;
const DARK_REFRESH_PALETTE = {
  primary: "rgb(102, 126, 234)",
  secondary: "rgb(118, 75, 162)",
  track: "rgba(102, 126, 234, 0.12)",
  glow: [
    "rgba(102, 126, 234, 0.18)",
    "rgba(118, 75, 162, 0.18)",
  ] as const,
};
const LIGHT_REFRESH_PALETTE = {
  primary: "rgb(66, 133, 244)",
  secondary: "rgb(124, 58, 237)",
  track: "rgba(66, 133, 244, 0.18)",
  glow: [
    "rgba(66, 133, 244, 0.12)",
    "rgba(124, 58, 237, 0.14)",
  ] as const,
};

function AnimatedIcon({
  spin,
  pulse,
  primaryColor,
  secondaryColor,
  trackColor,
  glowColors,
  iconSource,
}: {
  spin: SharedValue<number>;
  pulse: SharedValue<number>;
  primaryColor: string;
  secondaryColor: string;
  trackColor: string;
  glowColors: readonly [string, string];
  iconSource: ImageSourcePropType;
}) {
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [0.9, 1.04]) },
    ],
  }));

  return (
    <View style={{ width: RING_SIZE + 4, height: RING_SIZE + 4, alignItems: "center", justifyContent: "center", overflow: "visible" }}>
      <View
        style={{
          position: "absolute",
          width: SIZE + 8,
          height: SIZE + 8,
          borderRadius: (SIZE + 8) / 2,
          overflow: "hidden",
        }}
      >
        <LinearGradient
          colors={glowColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: SIZE + 8,
            height: SIZE + 8,
            borderRadius: (SIZE + 8) / 2,
          }}
        />
      </View>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RING_SIZE / 2,
            borderWidth: RING_BORDER_WIDTH,
            borderColor: trackColor,
            borderTopColor: primaryColor,
            borderRightColor: secondaryColor,
          },
          ringStyle,
        ]}
      />
      <Animated.View style={iconStyle}>
        <Image
          source={iconSource}
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

  const start = useCallback(() => {
    spin.value = 0;
    pulse.value = 0;
    spin.value = withRepeat(
      withTiming(360, { duration: 1600, easing: Easing.linear }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse, spin]);

  const stop = useCallback(() => {
    cancelAnimation(spin);
    cancelAnimation(pulse);
    spin.value = 0;
    pulse.value = 0;
  }, [pulse, spin]);

  return { spin, pulse, start, stop };
}

export function RefreshIndicator() {
  const { rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const palette = isDark ? DARK_REFRESH_PALETTE : LIGHT_REFRESH_PALETTE;
  const iconSource = isDark
    ? require("@/assets/images/app-dark-icon.png")
    : require("@/assets/images/app-icon.png");
  const { spin, pulse, start, stop } = useRefreshAnimations();

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return (
    <View style={{ alignItems: "center", paddingVertical: 16, overflow: "visible" }}>
      <AnimatedIcon
        spin={spin}
        pulse={pulse}
        primaryColor={palette.primary}
        secondaryColor={palette.secondary}
        trackColor={palette.track}
        glowColors={palette.glow}
        iconSource={iconSource}
      />
    </View>
  );
}

type IOSRefreshIndicatorProps = {
  visible: boolean;
  topOffset: number;
  scrollY: SharedValue<number>;
  pullDistance?: SharedValue<number>;
};

export function IOSRefreshIndicator({ visible, topOffset, scrollY, pullDistance }: IOSRefreshIndicatorProps) {
  const { rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const palette = isDark ? DARK_REFRESH_PALETTE : LIGHT_REFRESH_PALETTE;
  const iconSource = isDark
    ? require("@/assets/images/app-dark-icon.png")
    : require("@/assets/images/app-icon.png");
  const { spin, pulse, start, stop } = useRefreshAnimations();
  const isRefreshing = useSharedValue(false);

  useEffect(() => {
    isRefreshing.value = visible;
    if (visible) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [isRefreshing, start, stop, visible]);

  const progress = useDerivedValue(() => {
    if (isRefreshing.value) return 1;
    const pull = pullDistance ? pullDistance.value : -scrollY.value;
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
        <AnimatedIcon
          spin={spin}
          pulse={pulse}
          primaryColor={palette.primary}
          secondaryColor={palette.secondary}
          trackColor={palette.track}
          glowColors={palette.glow}
          iconSource={iconSource}
        />
      </Animated.View>
    </Animated.View>
  );
}
