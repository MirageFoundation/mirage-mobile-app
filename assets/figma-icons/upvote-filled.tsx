import * as React from "react";
import Svg, { Path } from "react-native-svg";

type UpvoteFilledIconProps = {
  size?: number;
  color?: string;
};

function UpvoteFilledIcon({
  size = 18,
  color = "#000",
}: UpvoteFilledIconProps) {
  // Original viewBox is 18x20, we maintain aspect ratio
  const height = size * (11 / 16);
  return (
    <Svg width={size} height={height} viewBox="0 0 16 11" fill="none">
      <Path d="M0 10.167h15.341L7.671 0 0 10.167z" fill={color} />
    </Svg>
  );
}

export default UpvoteFilledIcon;
