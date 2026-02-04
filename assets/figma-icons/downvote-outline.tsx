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
  const height = size * (15 / 20);
  return (
    <Svg width={size} height={height} viewBox="0 0 20 15" fill="none">
      <Path
        d="M19.884.536A1 1 0 0018.998 0h-18a1.002 1.002 0 00-.822 1.569l9 13a.998.998 0 001.644 0l9-13a1 1 0 00.064-1.033zM9.998 12.243L2.906 2H17.09L9.998 12.243z"
        fill={color}
      />
    </Svg>
  );
}

export default DownvoteOutlineIcon;
