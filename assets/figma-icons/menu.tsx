import * as React from "react";
import Svg, { Path } from "react-native-svg";

type MenuIconProps = {
  size?: number;
  color?: string;
};

function MenuIcon({ size = 17, color = "#000" }: MenuIconProps) {
  // Original viewBox is 17x14, we maintain aspect ratio
  const height = size * (14 / 17);
  return (
    <Svg width={size} height={height} viewBox="0 0 17 14" fill="none">
      <Path
        d="M.75 6.52h15m-15 5.77h15M.75.75h15"
        stroke={color}
        strokeWidth={1.5}
        strokeMiterlimit={10}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default MenuIcon;
