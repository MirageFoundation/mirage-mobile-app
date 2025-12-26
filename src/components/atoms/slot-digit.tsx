import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  SharedValue,
} from "react-native-reanimated";

const DIGIT_HEIGHT = 14;

type SlotDigitProps = {
  digit: string;
  color: SharedValue<string>;
};

export const SlotDigit = React.memo(({ digit, color }: SlotDigitProps) => {
  const translateY = useSharedValue(0);
  const prevDigit = useRef(digit);

  useEffect(() => {
    if (digit !== prevDigit.current) {
      const isNumber = !isNaN(Number(digit)) && !isNaN(Number(prevDigit.current));
      const from = Number(prevDigit.current);
      const to = Number(digit);

      if (isNumber) {
        translateY.value = to > from ? -DIGIT_HEIGHT : DIGIT_HEIGHT;
      } else {
        translateY.value = -DIGIT_HEIGHT;
      }
      translateY.value = withSpring(0, {
        damping: 18,
        stiffness: 80,
        mass: 0.8,
      });
      prevDigit.current = digit;
    }
  }, [digit]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: color.value,
    fontSize: 11,
    fontWeight: "bold" as const,
    fontVariant: ["tabular-nums"] as any,
  }));

  return (
    <View style={{ height: DIGIT_HEIGHT, overflow: "hidden", justifyContent: "center" }}>
      <Animated.View style={animatedStyle}>
        <Animated.Text style={textStyle}>{digit}</Animated.Text>
      </Animated.View>
    </View>
  );
});

SlotDigit.displayName = "SlotDigit";
