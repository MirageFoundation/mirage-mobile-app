import * as React from "react";
import Svg, { Path } from "react-native-svg";

type ShareIconProps = {
  size?: number;
  color?: string;
};

function ShareIcon({ size = 20, color = "#000" }: ShareIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 18" fill="none">
      <Path
        d="M19.707 8.293l-8-8A1 1 0 0010 1v3.545A11.015 11.015 0 000 15.5V17a1 1 0 001.784.62 11.46 11.46 0 017.887-4.05c.05-.005.175-.015.329-.025V17a1 1 0 001.707.707l8-8a1 1 0 000-1.414zM12 14.586V12.5a1 1 0 00-1-1c-.255 0-1.296.05-1.562.085a14 14 0 00-7.386 2.948A9.013 9.013 0 0111 6.5a1 1 0 001-1V3.414L17.586 9 12 14.586z"
        fill={color}
      />
    </Svg>
  );
}

export default ShareIcon;
