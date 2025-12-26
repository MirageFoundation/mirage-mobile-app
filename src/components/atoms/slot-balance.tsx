import React from "react";
import { View } from "react-native";
import { SharedValue } from "react-native-reanimated";
import { SlotDigit } from "./slot-digit";

type SlotBalanceProps = {
  value: number;
  colorValue: SharedValue<string>;
};

export const SlotBalance = ({ value, colorValue }: SlotBalanceProps) => {
  const formatted = `$${value.toFixed(2)}`;
  const digits = formatted.split("");

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {digits.map((digit, index) => (
        <SlotDigit key={index} digit={digit} color={colorValue} />
      ))}
    </View>
  );
};
