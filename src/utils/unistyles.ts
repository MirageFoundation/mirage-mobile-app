import { StyleSheet } from "react-native-unistyles";
import { Appearance } from "react-native";
import { lightTheme, darkTheme } from "@/config/theme";
import { storage } from "@/src/stores/mmkv-storage";

// Resolve the persisted theme preference synchronously so Unistyles starts on
// the correct theme and cold start requires no runtime setTheme call
// (back-to-back theme updates corrupt the Unistyles 3.2.4 shadow tree).
const getInitialTheme = (): "light" | "dark" => {
  try {
    const raw = storage.getString("preferences-storage");
    if (raw) {
      const mode = (JSON.parse(raw) as { state?: { theme?: string } }).state?.theme;
      if (mode === "light" || mode === "dark") return mode;
    }
  } catch {}
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
};

StyleSheet.configure({
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
  settings: {
    initialTheme: getInitialTheme,
  },
});

type AppThemes = {
  light: typeof lightTheme;
  dark: typeof darkTheme;
};

export type Theme = typeof lightTheme;

declare module "react-native-unistyles" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- required module augmentation pattern for unistyles theming
  export interface UnistylesThemes extends AppThemes {}
}
