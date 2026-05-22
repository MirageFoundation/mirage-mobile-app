import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { styles } from "./media-post-detail-styles";

type SeekBarProps = {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  width: number;
  tint?: string;
  playing?: boolean;
  tickIntervalMs?: number;
};

const SeekBar = memo(function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  width,
  tint = "#fff",
  playing = true,
  tickIntervalMs = 250,
}: SeekBarProps) {
  const dragX = useSharedValue<number | null>(null);
  const trackWidth = Math.max(1, width);
  const { theme } = useUnistyles();

  const baseProgress = durationMs > 0 ? positionMs / durationMs : 0;
  const baseProgressShared = useSharedValue(baseProgress);
  useEffect(() => {
    const prev = baseProgressShared.value;
    const delta = baseProgress - prev;
    // If paused, no duration, or non-monotonic jump (seek/loop), snap.
    if (!playing || durationMs <= 0 || delta < 0 || delta > 0.1) {
      baseProgressShared.value = baseProgress;
      return;
    }
    // Otherwise linearly interpolate to the next sampled progress over the
    // expected tick interval so playback advances smoothly between polls.
    baseProgressShared.value = withTiming(baseProgress, {
      duration: tickIntervalMs,
      easing: Easing.linear,
    });
  }, [baseProgress, baseProgressShared, durationMs, playing, tickIntervalMs]);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      dragX.value = Math.max(0, Math.min(trackWidth, e.x));
    })
    .onUpdate((e) => {
      dragX.value = Math.max(0, Math.min(trackWidth, e.x));
    })
    .onEnd(() => {
      if (dragX.value === null) return;
      const frac = dragX.value / trackWidth;
      const ms = frac * (durationMs > 0 ? durationMs : 0);
      runOnJS(onSeek)(ms);
      dragX.value = null;
    })
    .minDistance(0);

  const fillStyle = useAnimatedStyle(() => {
    const frac =
      dragX.value !== null ? dragX.value / trackWidth : baseProgressShared.value;
    return { width: trackWidth * Math.max(0, Math.min(1, frac)) };
  });

  const knobStyle = useAnimatedStyle(() => {
    const frac =
      dragX.value !== null ? dragX.value / trackWidth : baseProgressShared.value;
    return {
      transform: [
        { translateX: trackWidth * Math.max(0, Math.min(1, frac)) - 7 },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.seekTrack, { width: trackWidth }]}
        hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
      >
        <View
          style={[
            styles.seekTrackBg,
            { backgroundColor: theme.colors.border.subtle },
          ]}
        />
        <Animated.View
          style={[styles.seekTrackFill, { backgroundColor: tint }, fillStyle]}
        />
        <Animated.View
          style={[styles.seekKnob, { backgroundColor: tint }, knobStyle]}
        />
      </View>
    </GestureDetector>
  );
});

export const SeekBarFlex = memo(function SeekBarFlex({
  positionMs,
  durationMs,
  onSeek,
  tint,
  playing,
  tickIntervalMs,
}: Omit<SeekBarProps, "width">) {
  const [w, setW] = useState(0);
  return (
    <View
      style={{ width: "100%" }}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
    >
      {w > 0 ? (
        <SeekBar
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={onSeek}
          width={w}
          tint={tint}
          playing={playing}
          tickIntervalMs={tickIntervalMs}
        />
      ) : (
        <View style={[styles.seekTrack, { width: "100%" as any }]}>
          <View style={styles.seekTrackBg} />
        </View>
      )}
    </View>
  );
});

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
