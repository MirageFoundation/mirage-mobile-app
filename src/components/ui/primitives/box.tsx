import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { useTheme } from "@/providers/theme-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import { useEffect } from "react";
import { styles } from "./box-styles";

type AnimationType =
  | "fade-in"
  | "fade-out"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "scale-in"
  | "scale-out"
  | "bounce-in"
  | "shake"
  | "pulse";

type AnimationConfig = {
  duration?: number;
  delay?: number;
  repeat?: number;
  onComplete?: () => void;
};

const getAnimationValues = (animationType: AnimationType) => {
  switch (animationType) {
    case "fade-in":
      return { opacity: { from: 0, to: 1 } };
    case "fade-out":
      return { opacity: { from: 1, to: 0 } };
    case "slide-up":
      return { translateY: { from: 50, to: 0 }, opacity: { from: 0, to: 1 } };
    case "slide-down":
      return { translateY: { from: -50, to: 0 }, opacity: { from: 0, to: 1 } };
    case "slide-left":
      return { translateX: { from: 50, to: 0 }, opacity: { from: 0, to: 1 } };
    case "slide-right":
      return { translateX: { from: -50, to: 0 }, opacity: { from: 0, to: 1 } };
    case "scale-in":
      return { scale: { from: 0, to: 1 }, opacity: { from: 0, to: 1 } };
    case "scale-out":
      return { scale: { from: 1, to: 0 }, opacity: { from: 1, to: 0 } };
    case "bounce-in":
      return { scale: { from: 0, to: 1 }, opacity: { from: 0, to: 1 } };
    case "shake":
      return { translateX: { from: 0, to: 10 } };
    case "pulse":
      return { scale: { from: 1, to: 1.05 } };
    default:
      return {};
  }
};

const useAnimations = (
  animations: AnimationType | AnimationType[] | undefined,
  config: AnimationConfig = {},
) => {
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const { duration = 300, delay = 0, repeat = 0, onComplete } = config;

  useEffect(() => {
    if (!animations) return;

    const animationList = Array.isArray(animations) ? animations : [animations];

    const initializeValues = () => {
      animationList.forEach((animation) => {
        const values = getAnimationValues(animation);
        if (values.opacity) opacity.value = values.opacity.from;
        if (values.translateX) translateX.value = values.translateX.from;
        if (values.translateY) translateY.value = values.translateY.from;
        if (values.scale) scale.value = values.scale.from;
      });
    };

    const runAnimations = () => {
      animationList.forEach((animation, index) => {
        const values = getAnimationValues(animation);
        const animationDelay = delay + index * 100;

        const runAnimation = () => {
          if (values.opacity) {
            opacity.value = withTiming(values.opacity.to, { duration });
          }

          if (values.translateX) {
            if (animation === "shake") {
              translateX.value = withSequence(
                withTiming(10, { duration: 50 }),
                withTiming(-10, { duration: 50 }),
                withTiming(10, { duration: 50 }),
                withTiming(-10, { duration: 50 }),
                withTiming(0, { duration: 50 }),
              );
            } else {
              translateX.value = withTiming(values.translateX.to, { duration });
            }
          }

          if (values.translateY) {
            translateY.value = withTiming(values.translateY.to, { duration });
          }

          if (values.scale) {
            if (animation === "bounce-in") {
              scale.value = withSpring(values.scale.to, {
                damping: 8,
                stiffness: 100,
              });
            } else if (animation === "pulse") {
              scale.value = withSequence(
                withTiming(1.05, { duration: duration / 2 }),
                withTiming(1, { duration: duration / 2 }),
              );
            } else {
              scale.value = withTiming(
                values.scale.to,
                { duration },
                (finished) => {
                  if (
                    finished &&
                    onComplete &&
                    index === animationList.length - 1
                  ) {
                    runOnJS(onComplete)();
                  }
                },
              );
            }
          }
        };

        if (animationDelay > 0) {
          setTimeout(runAnimation, animationDelay);
        } else {
          runAnimation();
        }
      });
    };

    initializeValues();

    const timer = setTimeout(() => {
      runAnimations();

      if (repeat > 0) {
        const repeatInterval = setInterval(
          () => {
            initializeValues();
            runAnimations();
          },
          duration + delay + 100,
        );

        setTimeout(
          () => {
            clearInterval(repeatInterval);
          },
          (duration + delay + 100) * repeat,
        );
      }
    }, 16);

    return () => clearTimeout(timer);
  }, [animations, duration, delay, repeat, onComplete]);

  const animatedStyle = useAnimatedStyle(() => {
    const transforms = [];
    if (translateX.value !== 0) {
      transforms.push({ translateX: translateX.value });
    }
    if (translateY.value !== 0) {
      transforms.push({ translateY: translateY.value });
    }
    if (scale.value !== 1) {
      transforms.push({ scale: scale.value });
    }

    return {
      opacity: opacity.value,
      transform: transforms.length > 0 ? transforms : undefined,
    };
  });

  return animatedStyle;
};

export type BoxProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  background?:
    | "plain"
    | "dim"
    | "subtle"
    | "emphasis"
    | "base"
    | "inverse"
    | "light"
    | "lighter"
    | "lightest"
    | "dark"
    | "darker"
    | "darkest";
  p?: "xs" | "sm" | "md" | "lg";
  px?: "xs" | "sm" | "md" | "lg";
  py?: "xs" | "sm" | "md" | "lg";
  pt?: "xs" | "sm" | "md" | "lg";
  pb?: "xs" | "sm" | "md" | "lg";
  pl?: "xs" | "sm" | "md" | "lg";
  pr?: "xs" | "sm" | "md" | "lg";
  border?: "none" | "subtle" | "thin" | "thick";
  shadow?: "none" | "sm" | "md" | "lg";
  mode?: "primary" | "secondary" | "warning" | "error" | "success" | "disabled";
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
  direction?: "row" | "column";
  m?: "xs" | "sm" | "md" | "lg";
  mt?: "xs" | "sm" | "md" | "lg";
  mb?: "xs" | "sm" | "md" | "lg";
  ml?: "xs" | "sm" | "md" | "lg";
  mr?: "xs" | "sm" | "md" | "lg";
  gap?: "xs" | "sm" | "md" | "lg";
  flex?: boolean;
  center?: boolean;
  safeArea?: boolean;
  safeAreaTop?: boolean;
  safeAreaBottom?: boolean;
  justifyContent?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  animation?: AnimationType | AnimationType[];
  animationConfig?: AnimationConfig;
};

const Box = ({
  children,
  style,
  background,
  p,
  px,
  py,
  pt,
  pb,
  pl,
  pr,
  border,
  shadow,
  mode,
  rounded,
  direction,
  m,
  mt,
  mb,
  ml,
  mr,
  gap,
  flex,
  center,
  safeArea,
  safeAreaTop,
  safeAreaBottom,
  justifyContent,
  alignItems,
  animation,
  animationConfig,
}: BoxProps) => {
  const { currentTheme } = useTheme();
  const isDark = currentTheme === "dark";
  let shadowNow = shadow;
  let borderNow = border;
  if (isDark && shadow) {
    shadowNow = "none";
    borderNow = "thin";
  }

  const animatedStyle = useAnimations(animation, animationConfig);

  styles.useVariants({
    background,
    p,
    px,
    py,
    pt,
    pb,
    pl,
    pr,
    border: borderNow,
    shadow: shadowNow,
    mode,
    rounded,
    direction,
    m,
    mt,
    mb,
    ml,
    mr,
    gap,
    flex,
    center,
    safeArea,
    safeAreaTop,
    safeAreaBottom,
    justifyContent,
    alignItems,
  });

  const Component = animation ? Animated.View : View;
  const componentStyle = animation
    ? [styles.base, style, animatedStyle]
    : [styles.base, style];

  return <Component style={componentStyle}>{children}</Component>;
};

export { Box };
