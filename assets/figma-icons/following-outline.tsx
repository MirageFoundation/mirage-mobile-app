import * as React from "react";
import Svg, { Path } from "react-native-svg";

type FollowingOutlineIconProps = {
  size?: number;
  color?: string;
};

function FollowingOutlineIcon({
  size = 14,
  color = "#000",
}: FollowingOutlineIconProps) {
  // Original viewBox is 14x15, we maintain aspect ratio
  const height = size * (14 / 22);
  return (
    <Svg width={size} height={height} viewBox="0 0 22 14" fill="none">
      <Path
        d="M7 8.5c1.102 0 2.789.281 4.188.84.698.28 1.294.617 1.707.998.409.377.605.763.605 1.162V13c0 .274-.226.5-.5.5H1a.503.503 0 01-.5-.5v-1.5c0-.399.196-.785.605-1.162.413-.38 1.009-.718 1.708-.997C4.21 8.78 5.897 8.5 7 8.5zm8.293.008c1.094.043 2.615.32 3.895.833.698.28 1.294.616 1.707.997.409.377.605.763.605 1.162V13c0 .274-.226.5-.5.5h-4.542c.025-.162.042-.33.042-.5v-1.5c0-1.215-.48-2.202-1.207-2.992zM7 .5A2.488 2.488 0 019.49 3c0 1.386-1.108 2.5-2.49 2.5A2.496 2.496 0 014.5 3C4.5 1.616 5.616.5 7 .5zm8 0A2.488 2.488 0 0117.49 3c0 1.386-1.108 2.5-2.49 2.5A2.496 2.496 0 0112.5 3c0-1.384 1.116-2.5 2.5-2.5z"
        stroke={color}
      />
    </Svg>
  );
}

export default FollowingOutlineIcon;
