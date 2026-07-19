import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Appearance } from "react-native";
import {
  UnistylesRuntime,
  type UnistylesThemes,
} from "react-native-unistyles";
import { usePreferencesStore, type ThemeMode } from "@/src/stores";

type ThemeContextType = {
  currentTheme: "light" | "dark";
  themeMode: ThemeMode;
  isThemeReady: boolean;
  setThemeMode: (mode: ThemeMode) => void;
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
  const initialTheme = UnistylesRuntime.themeName === "light" ? "light" : "dark";
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">(initialTheme);
  const pendingFrameRef = useRef<number | null>(null);
  const pendingNativeFrameRef = useRef<number | null>(null);

  // Subscribe to preferences store for theme mode
  const themeMode = usePreferencesStore((s) => s.theme);
  const persistThemeMode = usePreferencesStore((s) => s.setTheme);

  const cancelPendingFrames = useCallback(() => {
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
    if (pendingNativeFrameRef.current !== null) {
      cancelAnimationFrame(pendingNativeFrameRef.current);
      pendingNativeFrameRef.current = null;
    }
  }, []);

  const applyResolvedTheme = useCallback((
    resolvedTheme: "light" | "dark",
    nativeMode?: "light" | "dark",
  ) => {
    cancelPendingFrames();
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      if (UnistylesRuntime.themeName !== resolvedTheme) {
        UnistylesRuntime.setTheme(resolvedTheme as keyof UnistylesThemes);
      }
      setCurrentTheme(resolvedTheme);

      if (nativeMode) {
        pendingNativeFrameRef.current = requestAnimationFrame(() => {
          pendingNativeFrameRef.current = null;
          Appearance.setColorScheme(nativeMode);
        });
      }
    });
  }, [cancelPendingFrames]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    persistThemeMode(mode);
    if (mode === "system") {
      cancelPendingFrames();
      Appearance.setColorScheme(null);
      pendingFrameRef.current = requestAnimationFrame(() => {
        pendingFrameRef.current = null;
        const resolvedTheme = Appearance.getColorScheme() === "dark"
          ? "dark"
          : "light";
        if (UnistylesRuntime.themeName !== resolvedTheme) {
          UnistylesRuntime.setTheme(resolvedTheme as keyof UnistylesThemes);
        }
        setCurrentTheme(resolvedTheme);
      });
      return;
    }
    applyResolvedTheme(mode, mode);
  }, [applyResolvedTheme, cancelPendingFrames, persistThemeMode]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      applyResolvedTheme(colorScheme === "dark" ? "dark" : "light");
    });
    return () => subscription.remove();
  }, [applyResolvedTheme, themeMode]);

  useEffect(() => () => cancelPendingFrames(), [cancelPendingFrames]);

  // Unistyles 3.2.4 can corrupt its native shadow tree during runtime theme
  // changes during startup. The persisted initial theme is still configured
  // before render; runtime changes happen only after an explicit user action
  // or a later system appearance event. Unistyles and React Native Appearance
  // updates are coalesced and dispatched on separate frames.
  const isThemeReady = true;

  const value: ThemeContextType = useMemo(() => ({
    currentTheme,
    themeMode,
    isThemeReady,
    setThemeMode,
  }), [currentTheme, themeMode, isThemeReady, setThemeMode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
