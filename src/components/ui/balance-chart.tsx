import { Box } from "@/primitives";
// import { LineGraph } from "react-native-graph";

type BalanceChartProps = {
  balance: number;
  height?: number;
  color?: string;
  animated?: boolean;
};

export const BalanceChart = ({
  balance,
  height = 80,
  color = "#3873e1",
  animated = false,
}: BalanceChartProps) => {
  return (
    <Box style={{ height, width: "100%" }}>
      {/*<LineGraph
        points={graphData}
        animated={animated}
        color={color}
        enableFadeInMask
        style={{ flex: 1 }}
      />*/}
    </Box>
  );
};
