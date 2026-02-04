import { StatusBar } from "expo-status-bar";
import { useTheme } from "@/src/providers/theme-context";

export const ThemedStatusBar = () => {
  const { currentTheme } = useTheme();
  return <StatusBar style={currentTheme === "dark" ? "light" : "dark"} />;
};
