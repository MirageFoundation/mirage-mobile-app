import * as React from "react";
import Svg, { Path } from "react-native-svg";

type DownvoteFilledIconProps = {
  size?: number;
  color?: string;
};

function DownvoteFilledIcon({
  size = 20,
  color = "#000",
}: DownvoteFilledIconProps) {
  // Original viewBox is 18x20, we maintain aspect ratio
  const height = size * (15 / 20);
  return (
    <Svg width={size} height={height} viewBox="0 0 20 15" fill="none">
      <Path
        d="M9.176 14.569a.998.998 0 001.644 0l9-13A1 1 0 0018.998 0h-18a1.002 1.002 0 00-.822 1.569l9 13z"
        fill={color}
      />
    </Svg>
  );
}

export default DownvoteFilledIcon;
