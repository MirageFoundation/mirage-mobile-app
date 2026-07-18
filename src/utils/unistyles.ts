import { StyleSheet } from "react-native-unistyles";
import { lightTheme, darkTheme } from "@/config/theme";

StyleSheet.configure({
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
  settings: {
    adaptiveThemes: true,
  },
});

type AppThemes = {
  light: typeof lightTheme;
  dark: typeof darkTheme;
};

export type Theme = typeof lightTheme;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
}
