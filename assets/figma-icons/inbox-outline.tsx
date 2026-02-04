import * as React from "react";
import Svg, { Path } from "react-native-svg";

type InboxOutlineIconProps = {
  size?: number;
  color?: string;
};

function InboxOutlineIcon({
  size = 18,
  color = "#000",
}: InboxOutlineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M3.177 5.47a5.586 5.586 0 0111.104 0l.252 2.267.006.057a8 8 0 001.074 3.18l.03.05.577.963c.525.874.787 1.31.73 1.67a1 1 0 01-.345.61c-.279.234-.789.234-1.808.234H2.661c-1.02 0-1.53 0-1.808-.233a1 1 0 01-.346-.611c-.056-.36.206-.796.73-1.67l.58-.964.03-.05a8 8 0 001.072-3.18l.006-.056.252-2.266z"
        stroke={color}
      />
      <Path
        d="M5.831 14.907c.171.744.548 1.402 1.072 1.87.524.47 1.166.724 1.826.724.66 0 1.302-.254 1.826-.723.524-.47.9-1.127 1.072-1.871"
        stroke={color}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default InboxOutlineIcon;
