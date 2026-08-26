import {
  BlurView as ExpoBlurView,
  type BlurTint,
  type BlurMethod,
} from "expo-blur";
import { withUnistyles } from "react-native-unistyles";

const BlurView = withUnistyles(ExpoBlurView, (_theme, rt) => ({
  tint: (rt.themeName === "dark" ? "dark" : "light") as BlurTint,
  blurMethod: "dimezisBlurView" as BlurMethod,
}));

export default BlurView;
