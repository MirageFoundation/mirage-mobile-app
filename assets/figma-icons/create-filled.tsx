import * as React from "react";
import Svg, { Path } from "react-native-svg";

type CreateFilledIconProps = {
  size?: number;
  color?: string;
};

function CreateFilledIcon({
  size = 22,
  color = "#000",
}: CreateFilledIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path
        d="M19.957 1.383C18.762.187 17.074 0 15.082 0h-8.86C4.255 0 2.567.188 1.372 1.383.175 2.578 0 4.253 0 6.21v8.859c0 2.004.176 3.668 1.371 4.863 1.195 1.196 2.883 1.383 4.887 1.383h8.824c1.992 0 3.68-.188 4.875-1.383 1.195-1.195 1.371-2.859 1.371-4.863V6.246c0-2.004-.175-3.68-1.371-4.863zm-9.293 16.148a.928.928 0 01-.926-.926v-5.027H4.723a.925.925 0 01-.926-.914c0-.492.41-.938.925-.938h5.016V4.71c0-.526.41-.937.926-.937.527 0 .926.41.926.937v5.016h5.027c.516 0 .926.445.926.938 0 .492-.41.914-.926.914H11.59v5.027a.92.92 0 01-.926.925z"
        fill={color}
      />
    </Svg>
  );
}

export default CreateFilledIcon;
