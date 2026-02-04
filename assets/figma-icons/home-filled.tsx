import * as React from "react";
import Svg, { ClipPath, Defs, G, Path } from "react-native-svg";

type HomeFilledIconProps = {
  size?: number;
  color?: string;
};

function HomeFilledIcon({ size = 14, color = "#000" }: HomeFilledIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <G clipPath="url(#clip0_129_30)">
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M.318 6.045A1 1 0 000 6.776V12.5A1.5 1.5 0 001.5 14H6v-3a1 1 0 012 0v3h4.5a1.5 1.5 0 001.5-1.5V6.776a1 1 0 00-.318-.731L7.325.12a.5.5 0 00-.65 0L.318 6.045z"
          fill={color}
        />
      </G>
      <Defs>
        <ClipPath id="clip0_129_30">
          <Path fill="#fff" d="M0 0H14V14H0z" />
        </ClipPath>
      </Defs>
    </Svg>
  );
}

export default HomeFilledIcon;
