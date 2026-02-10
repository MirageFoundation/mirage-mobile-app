import * as React from "react";
import Svg, { Path } from "react-native-svg";

type UpvoteOutlineIconProps = {
  size?: number;
  color?: string;
};

function UpvoteOutlineIcon({
  size = 18,
  color = "#000",
}: UpvoteOutlineIconProps) {
  // Original viewBox is 18x20, we maintain aspect ratio
  const height = size * (15 / 20);
  return (
    <Svg width={size} height={height} viewBox="0 0 20 15" fill="none">
      <Path
        d="M1 15h18.001a1 1 0 00.997-1.063 1.003 1.003 0 00-.174-.509l-9-13.023c-.373-.54-1.271-.54-1.645 0l-9 13.023A1.002 1.002 0 001 15zm9-12.265l7.093 10.261H2.91L10 2.736z"
        fill={color}
      />
    </Svg>
  );
}

export default UpvoteOutlineIcon;
