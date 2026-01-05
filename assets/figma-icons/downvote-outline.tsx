import * as React from "react";
import Svg, { Path } from "react-native-svg";

type DownvoteOutlineIconProps = {
  size?: number;
  color?: string;
};

function DownvoteOutlineIcon({
  size = 18,
  color = "#000",
}: DownvoteOutlineIconProps) {
  // Original viewBox is 18x20, we maintain aspect ratio
  const height = size * (20 / 18);
  return (
    <Svg width={size} height={height} viewBox="0 0 18 20" fill="none">
      <Path
        d="M11.586 2v8h3.586a1 1 0 01.707 1.707l-6.586 6.586a1 1 0 01-1.414 0l-6.586-6.586A1 1 0 012 10h3.586V2a1 1 0 011-1h4a1 1 0 011 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default DownvoteOutlineIcon;
