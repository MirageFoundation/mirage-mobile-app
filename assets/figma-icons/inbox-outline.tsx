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
  const height = size * (14 / 18);
  return (
    <Svg width={size} height={height} viewBox="0 0 18 14" fill="none">
      <Path
        d="M1.616 14c-.46 0-.845-.154-1.153-.462-.308-.308-.462-.693-.463-1.154V1.616C0 1.156.154.771.463.463A1.569 1.569 0 011.615 0h14.77c.46 0 .844.154 1.152.463.308.309.462.693.463 1.153v10.769c0 .46-.154.844-.463 1.153a1.56 1.56 0 01-1.152.462H1.616zM17 1.885L9.448 6.829c-.07.037-.142.068-.214.093A.723.723 0 019 6.959a.723.723 0 01-.234-.037 1.434 1.434 0 01-.214-.093L1 1.884v10.5a.6.6 0 00.173.443.6.6 0 00.443.173h14.769c.18 0 .327-.058.442-.173a.6.6 0 00.173-.443V1.885zM9 6l7.692-5H1.308L9 6zM1 2.096v-.811.034V1v.32-.052.828z"
        fill={color}
      />
    </Svg>
  );
}

export default InboxOutlineIcon;
