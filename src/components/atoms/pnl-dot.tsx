import React from "react";
import { Box } from "@/components/ui/primitives/box";

type PnlDotProps = {
  pnl: number;
  size?: number;
};

export const PnlDot = ({ pnl, size = 6 }: PnlDotProps) => {
  return (
    <Box
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: pnl >= 0 ? "#00FF66" : "#FF4444",
        opacity: 0.8,
      }}
    />
  );
};
