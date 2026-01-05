import * as React from "react";
import Svg, { Path } from "react-native-svg";

type DownvoteFilledIconProps = {
  size?: number;
  color?: string;
};

function DownvoteFilledIcon({
  size = 18,
  color = "#000",
}: DownvoteFilledIconProps) {
  // Original viewBox is 18x20, we maintain aspect ratio
  const height = size * (20 / 18);
  return (
    <Svg width={size} height={height} viewBox="0 0 18 20" fill="none">
      <Path
        d="M6.586 0l-.15.005A2 2 0 004.586 2v6.999L2 9a2 2 0 00-1.414 3.414L7.172 19A2 2 0 0010 19l6.586-6.586a2 2 0 00.434-2.18l-.068-.145A2 2 0 0015.172 9l-2.586-.001V2a2 2 0 00-2-2h-4z"
        fill={color}
      />
    </Svg>
  );
}

export default DownvoteFilledIcon;
