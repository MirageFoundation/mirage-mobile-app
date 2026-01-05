import * as React from "react";
import Svg, { ClipPath, Defs, G, Path } from "react-native-svg";

type HomeOutlineIconProps = {
  size?: number;
  color?: string;
};

function HomeOutlineIcon({ size = 14, color = "#000" }: HomeOutlineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <G clipPath="url(#clip0_129_28)">
        <Path
          d="M7 13.5v-4m6.5-2.56a.999.999 0 00-.32-.74L7 .5.82 6.2a1 1 0 00-.32.74v5.56a1 1 0 001 1h11a1 1 0 001-1V6.94z"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Defs>
        <ClipPath id="clip0_129_28">
          <Path fill="#fff" d="M0 0H14V14H0z" />
        </ClipPath>
      </Defs>
    </Svg>
  );
}

export default HomeOutlineIcon;
