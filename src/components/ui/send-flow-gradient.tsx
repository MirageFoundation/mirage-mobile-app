import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { LinearGradient } from "expo-linear-gradient";
import { Box } from "./primitives";
import type { ViewStyle, StyleProp } from "react-native";

export interface SendFlowGradientProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  opacity?: number;
  fallbackColor?: string;
  direction?: "vertical" | "horizontal" | "diagonal";
  positions?: "top" | "bottom" | "center" | "full";
  disabled?: boolean;
  mint?: string;
}

const SendFlowGradient: React.FC<SendFlowGradientProps> = ({
  children,
  style,
  opacity = 0.7,
  fallbackColor = "#6366f1",
  direction = "vertical",
  positions = "top",
  disabled = false,
  mint,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Reset animation whenever component mounts or targetMint changes
  useEffect(() => {
    if (!disabled && mint) {
      // Stop any ongoing animation
      if (animationRef.current) {
        animationRef.current.stop();
      }
      fadeAnim.setValue(0);
    }
  }, [mint, disabled, fadeAnim]);

  // Animate in when gradient colors are available
  useEffect(() => {
    if (!disabled) {
      // Stop any ongoing animation
      if (animationRef.current) {
        animationRef.current.stop();
      }

      // Small delay to ensure proper state reset
      const timer = setTimeout(() => {
        animationRef.current = Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        });
        animationRef.current.start();
      }, 100);

      return () => {
        clearTimeout(timer);
        if (animationRef.current) {
          animationRef.current.stop();
        }
      };
    }
  }, [disabled, fadeAnim]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, []);

  const gradientStartEnd = React.useMemo(() => {
    switch (direction) {
      case "horizontal":
        return { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };
      case "diagonal":
        return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
      case "vertical":
      default:
        return { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } };
    }
  }, [direction]);

  const gradientColors2 = React.useMemo((): string[] => {
    const fallbackPrimary = `${fallbackColor}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
    const fallbackSecondary = `${fallbackColor}${Math.round(opacity * 0.5 * 255).toString(16).padStart(2, "0")}`;

    switch (positions) {
      case "top":
        return [
          fallbackPrimary,
          fallbackSecondary,
          "transparent",
          "transparent",
        ];
      case "bottom":
        return [
          "transparent",
          "transparent",
          fallbackSecondary,
          fallbackPrimary,
        ];
      case "center":
        return [
          "transparent",
          fallbackPrimary,
          fallbackSecondary,
          "transparent",
        ];
      case "full":
      default:
        return [fallbackPrimary, fallbackSecondary];
    }
  }, [fallbackColor, positions, opacity]);

  // If disabled, just render children without gradient
  if (disabled) {
    return <Box style={style}>{children}</Box>;
  }

  return (
    <>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, style, { opacity: fadeAnim }]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={
            gradientColors2.length >= 2
              ? (gradientColors2 as [string, string, ...string[]])
              : ([
                  gradientColors2[0] || "transparent",
                  gradientColors2[0] || "transparent",
                ] as [string, string])
          }
          locations={
            positions === "top"
              ? [0, 0.25, 0.6, 1.0] // Top-heavy distribution
              : undefined
          }
          {...gradientStartEnd}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {children}
    </>
  );
};

export default SendFlowGradient;
