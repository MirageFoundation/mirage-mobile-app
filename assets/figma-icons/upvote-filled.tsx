import * as React from "react";
import Svg, { Path } from "react-native-svg";

type UpvoteFilledIconProps = {
  size?: number;
  color?: string;
};

function UpvoteFilledIcon({
  size = 18,
  color = "#000",
}: UpvoteFilledIconProps) {
  // Original viewBox is 18x20, we maintain aspect ratio
  const height = size * (15 / 20);
  return (
    <Svg width={size} height={height} viewBox="0 0 20 15" fill="none">
      <Path
        d="M1 15h18.001a1 1 0 00.997-1.063 1.003 1.003 0 00-.174-.509l-9-13.023c-.373-.54-1.271-.54-1.645 0l-9 13.023A1.002 1.002 0 001 15z"
        fill={color}
      />
    </Svg>
  );
}

export default UpvoteFilledIcon;
