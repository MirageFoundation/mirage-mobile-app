import React from "react";
import { ViewStyle, StyleProp } from "react-native";
import { BlurView } from "expo-blur";
import { Box } from "@/components/ui/primitives/box";

type BlurPillProps = {
  children: React.ReactNode;
  intensity?: number;
  borderColor?: string;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
};

export const BlurPill = ({
  children,
  intensity = 40,
  borderColor = "rgba(255,255,255,0.1)",
  backgroundColor,
  style,
  innerStyle,
}: BlurPillProps) => {
  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      style={[
        {
          overflow: "hidden",
          borderRadius: 20,
          borderWidth: 1,
          borderColor,
        },
        style,
      ]}
    >
      <Box
        style={[
          {
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor,
          },
          innerStyle,
        ]}
      >
        {children}
      </Box>
    </BlurView>
  );
};
