import * as React from "react";
import Svg, { Path } from "react-native-svg";

type InboxFilledIconProps = {
  size?: number;
  color?: string;
};

function InboxFilledIcon({ size = 18, color = "#000" }: InboxFilledIconProps) {
  const height = size * (14 / 18);
  return (
    <Svg width={size} height={height} viewBox="0 0 18 14" fill="none">
      <Path
        d="M1.616 14c-.46 0-.845-.154-1.153-.462-.308-.308-.462-.693-.463-1.154V1.616C0 1.156.154.771.463.463A1.569 1.569 0 011.615 0h14.77c.46 0 .844.154 1.152.463.308.309.462.693.463 1.153v10.769c0 .46-.154.844-.463 1.153a1.56 1.56 0 01-1.152.462H1.616zM9 6.96a.706.706 0 00.234-.038c.072-.025.143-.056.214-.093l7.229-4.733a.398.398 0 00.185-.235.447.447 0 00-.016-.297c-.025-.129-.11-.222-.252-.28a.44.44 0 00-.413.035L9 6 1.82 1.32a.458.458 0 00-.404-.052.388.388 0 00-.262.276.498.498 0 00-.015.313.38.38 0 00.184.24l7.229 4.732c.07.037.142.068.214.093.073.025.15.037.234.037"
        fill={color}
      />
    </Svg>
  );
}

export default InboxFilledIcon;
