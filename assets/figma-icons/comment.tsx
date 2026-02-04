import * as React from "react";
import Svg, { Path } from "react-native-svg";

type CommentIconProps = {
  size?: number;
  color?: string;
};

function CommentIcon({ size = 19, color = "#000" }: CommentIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 19 19" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 9.5A9.5 9.5 0 119.5 19H.75a.75.75 0 01-.53-1.28l2.053-2.054A9.47 9.47 0 010 9.5zm9.5-8a8 8 0 00-5.657 13.657.75.75 0 010 1.06L2.561 17.5H9.5a8 8 0 000-16z"
        fill={color}
      />
    </Svg>
  );
}

export default CommentIcon;
