import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useColorScheme, Appearance } from "react-native";
import { UnistylesRuntime, type UnistylesThemes } from "react-native-unistyles";
import { usePreferencesStore, type ThemeMode } from "@/src/stores";

type ThemeContextType = {
  currentTheme: "light" | "dark";
  themeMode: ThemeMode;
  isThemeReady: boolean;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeContextProvider");
  }
  return context;
};

export const ThemeContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const systemColorScheme = useColorScheme();
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");
  const [isThemeReady, setIsThemeReady] = useState(false);

  // Subscribe to preferences store for theme mode
  const themeMode = usePreferencesStore((s) => s.theme);

  // Apply theme whenever themeMode or system color scheme changes
  useEffect(() => {
    let resolvedTheme: "light" | "dark";

    if (themeMode === "system") {
      // Reset to system default - this allows useColorScheme to return the actual system value
      Appearance.setColorScheme(null);
      
      // Get the actual system color scheme
      const actualSystemTheme = Appearance.getColorScheme();
      resolvedTheme = actualSystemTheme === "dark" ? "dark" : "light";
    } else {
      // Manual override - set the color scheme explicitly
      resolvedTheme = themeMode;
      Appearance.setColorScheme(resolvedTheme);
    }

    // Apply theme to Unistyles
    UnistylesRuntime.setTheme(resolvedTheme as keyof UnistylesThemes);

    // Update state
    setCurrentTheme(resolvedTheme);
    setIsThemeReady(true);
  }, [themeMode, systemColorScheme]);

  const value: ThemeContextType = useMemo(() => ({
    currentTheme,
    themeMode,
    isThemeReady,
  }), [currentTheme, themeMode, isThemeReady]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
