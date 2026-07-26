import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

type ThemeMode = "light" | "dark";

interface ThemeContextType {
  isDark: boolean;
  theme: typeof darkTheme;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const lightTheme = {
  isDark: false,
  surface: "#F8F9FD",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#F1F4FA",
  onSurface: "#0F172A",
  onSurfaceSecondary: "#64748B",
  onSurfaceTertiary: "#94A3B8",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  brand: "#635BFF",
  brandSecondary: "#4F46E5",
  brandTertiary: "#ECEBFF",
  onBrand: "#FFFFFF",
  error: "#FEF2F2",
  onError: "#EF4444",
  success: "#ECFDF5",
  onSuccess: "#10B981",
  warning: "#FFFBEB",
  onWarning: "#F59E0B",
  card: "#FFFFFF",
  tabBarBg: "#121212",
};

export const darkTheme = {
  isDark: true,
  surface: "#0B0F19",
  surfaceSecondary: "#161C2E",
  surfaceTertiary: "#1F293D",
  onSurface: "#FFFFFF",
  onSurfaceSecondary: "#94A3B8",
  onSurfaceTertiary: "#64748B",
  border: "#26334D",
  borderStrong: "#334155",
  brand: "#635BFF",
  brandSecondary: "#4F46E5",
  brandTertiary: "#26294D",
  onBrand: "#FFFFFF",
  error: "#3B1719",
  onError: "#F87171",
  success: "#064E3B",
  onSuccess: "#34D399",
  warning: "#451A03",
  onWarning: "#FBBF24",
  card: "#161C2E",
  tabBarBg: "#0B0F19",
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  theme: lightTheme,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

const THEME_KEY = "billpro_theme_mode";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>("dark"); // default to dark per user reference

  useEffect(() => {
    (async () => {
      try {
        let saved: string | null = null;
        if (Platform.OS === "web") {
          saved = window.localStorage.getItem(THEME_KEY);
        } else {
          saved = await SecureStore.getItemAsync(THEME_KEY);
        }
        if (saved === "light" || saved === "dark") {
          setMode(saved);
        }
      } catch {}
    })();
  }, []);

  const setThemeMode = async (newMode: ThemeMode) => {
    setMode(newMode);
    try {
      if (Platform.OS === "web") {
        window.localStorage.setItem(THEME_KEY, newMode);
      } else {
        await SecureStore.setItemAsync(THEME_KEY, newMode);
      }
    } catch {}
  };

  const toggleTheme = () => {
    const next = mode === "dark" ? "light" : "dark";
    setThemeMode(next);
  };

  const currentTheme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider
      value={{
        isDark: mode === "dark",
        theme: currentTheme,
        toggleTheme,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
