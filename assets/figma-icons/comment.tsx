import * as React from "react";
import Svg, { Path } from "react-native-svg";

type CommentIconProps = {
  size?: number;
  color?: string;
};

function CommentIcon({ size = 18, color = "#000" }: CommentIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M2.7 0h12.6A2.7 2.7 0 0118 2.7v9a2.7 2.7 0 01-2.7 2.7H4.869l-3.33 3.339a.899.899 0 01-.639.26.755.755 0 01-.342-.071A.9.9 0 010 17.1V2.7A2.7 2.7 0 012.7 0zm-.9 14.93l2.061-2.07a.9.9 0 01.639-.26h10.8a.9.9 0 00.9-.9v-9a.9.9 0 00-.9-.9H2.7a.9.9 0 00-.9.9v12.23z"
        fill={color}
      />
    </Svg>
  );
}

export default CommentIcon;
