import { useEffect, useState } from "react";
import { Dimensions } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

export type OrientationInfo = {
  isLandscape: boolean;
  screenWidth: number;
  screenHeight: number;
};

export function useScreenOrientation(): OrientationInfo {
  const [dimensions, setDimensions] = useState(() => Dimensions.get("window"));

  useEffect(() => {
    const dimSub = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    const orientSub = ScreenOrientation.addOrientationChangeListener(() => {
      setDimensions(Dimensions.get("window"));
    });

    return () => {
      dimSub.remove();
      ScreenOrientation.removeOrientationChangeListener(orientSub);
    };
  }, []);

  return {
    isLandscape: dimensions.width > dimensions.height,
    screenWidth: dimensions.width,
    screenHeight: dimensions.height,
  };
}
