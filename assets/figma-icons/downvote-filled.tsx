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
  const height = size * (11 / 16);
  return (
    <Svg width={size} height={height} viewBox="0 0 16 11" fill="none">
      <Path d="M0 0h15.341l-7.67 10.167L0 0z" fill={color} />
    </Svg>
  );
}

export default DownvoteFilledIcon;
