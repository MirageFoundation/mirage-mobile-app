import * as React from "react";
import Svg, { Path } from "react-native-svg";

type ShareIconProps = {
  size?: number;
  color?: string;
};

function ShareIcon({ size = 18, color = "#000" }: ShareIconProps) {
  const height = size * (19 / 18);
  return (
    <Svg width={size} height={height} viewBox="0 0 18 19" fill="none">
      <Path
        d="M15 13.43c-.76 0-1.44.286-1.96.734l-7.13-3.958c.05-.22.09-.439.09-.668 0-.229-.04-.448-.09-.668l7.05-3.92c.54.477 1.25.773 2.04.773 1.66 0 3-1.278 3-2.862C18 1.278 16.66 0 15 0s-3 1.278-3 2.861c0 .23.04.449.09.668L5.04 7.45A3.066 3.066 0 003 6.677c-1.66 0-3 1.278-3 2.861C0 11.121 1.34 12.4 3 12.4c.79 0 1.5-.296 2.04-.773l7.12 3.968c-.05.2-.08.41-.08.62C12.08 17.75 13.39 19 15 19c1.61 0 2.92-1.25 2.92-2.785 0-1.536-1.31-2.785-2.92-2.785z"
        fill={color}
      />
    </Svg>
  );
}

export default ShareIcon;
