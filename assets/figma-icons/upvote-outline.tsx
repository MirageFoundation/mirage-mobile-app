import * as React from "react";
import Svg, { Path } from "react-native-svg";

type UpvoteOutlineIconProps = {
  size?: number;
  color?: string;
};

function UpvoteOutlineIcon({
  size = 18,
  color = "#000",
}: UpvoteOutlineIconProps) {
  // Original viewBox is 18x20, we maintain aspect ratio
  const height = size * (20 / 18);
  return (
    <Svg width={size} height={height} viewBox="0 0 18 20" fill="none">
      <Path
        d="M5.586 17.586v-8H2a1 1 0 01-.707-1.707l6.586-6.586a1 1 0 011.414 0l6.586 6.586a1 1 0 01-.707 1.707h-3.586v8a1 1 0 01-1 1h-4a1 1 0 01-1-1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default UpvoteOutlineIcon;
