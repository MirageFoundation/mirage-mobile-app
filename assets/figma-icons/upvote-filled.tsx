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
  const height = size * (20 / 18);
  return (
    <Svg width={size} height={height} viewBox="0 0 18 20" fill="none">
      <Path
        d="M7.172.586L.586 7.172a2 2 0 00-.434 2.18l.068.145A2 2 0 002 10.586h2.586v7a2 2 0 002 2h4l.15-.005a2 2 0 001.85-1.995v-7h2.586a2 2 0 001.414-3.414L10 .586a2 2 0 00-2.828 0z"
        fill={color}
      />
    </Svg>
  );
}

export default UpvoteFilledIcon;
