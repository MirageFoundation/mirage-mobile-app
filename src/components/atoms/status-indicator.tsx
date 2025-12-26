import React from "react";
import { Box } from "@/components/ui/primitives/box";
import { Text } from "@/components/ui/primitives/text";
import { BlurView } from "expo-blur";
import AnimatedPressable from "@/components/ui/primitives/animated-pressable";

type ConnectionState = "connected" | "connecting" | "disconnected" | "error";

type StatusIndicatorProps = {
  connectionState: ConnectionState;
  onPress?: () => void;
};

const STATUS_CONFIG = {
  connected: { color: "#00FF66", label: "LIVE" },
  connecting: { color: "#FFB800", label: "SYNC" },
  disconnected: { color: "#FF4444", label: "SIM" },
  error: { color: "#FF4444", label: "ERR" },
};

export const StatusIndicator = ({ connectionState, onPress }: StatusIndicatorProps) => {
  const config = STATUS_CONFIG[connectionState];

  return (
    <AnimatedPressable onPress={onPress}>
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          overflow: "hidden",
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        <Box
          direction="row"
          gap="sm"
          alignItems="center"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: config.color,
            }}
          />
          <Text weight="bold" size="sm">
            {config.label}
          </Text>
        </Box>
      </BlurView>
    </AnimatedPressable>
  );
};
