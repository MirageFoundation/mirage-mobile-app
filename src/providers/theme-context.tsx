import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from "react";
import { useColorScheme, Appearance } from "react-native";
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
  const appliedThemeModeRef = useRef<ThemeMode | null>(null);

  // Subscribe to preferences store for theme mode
  const themeMode = usePreferencesStore((s) => s.theme);

  // Unistyles 3.2.4 can corrupt its shadow tree when Appearance and setTheme
  // dispatch back-to-back updates. Adaptive themes need only this Appearance update.
  useEffect(() => {
    if (appliedThemeModeRef.current !== themeMode) {
      appliedThemeModeRef.current = themeMode;
      Appearance.setColorScheme(themeMode === "system" ? null : themeMode);
    }

    const resolvedTheme = themeMode === "system"
      ? systemColorScheme === "dark" ? "dark" : "light"
      : themeMode;

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
